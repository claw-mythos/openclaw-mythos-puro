// Handler — POST /api/skills/run
//
// Dispara uma skill (.md global do Claude Code CLI ou skill local em backend/.claude/skills/)
// via Claude SDK spawnado por claude-query.js. Retorna o resultado final + custo + duração.
//
// Body:
//   {
//     "skillName": "pipeline-pdf-evolution",   // opcional — se vazio, roda prompt direto
//     "prompt": "...",                          // obrigatório
//     "maxTurns": 5,                            // default 5 (limite de iterações)
//     "allowedTools": ["Read","Bash"],          // default [] (nada — só texto)
//     "timeoutMs": 120000,                      // default 2min
//     "model": "claude-opus-4-6"                // opcional — default do SDK
//   }
//
// Response:
//   {
//     "ok": true,
//     "result": "<texto final do assistant>",
//     "skillName": "...",
//     "model": "claude-opus-4-6",
//     "turns": 1,
//     "durationMs": 3456,
//     "costUsd": 0.16,
//     "messagesCount": 4
//   }
//
// Whitelist: built-ins fixos (skills shipadas pelo CLI claude) + descoberta dinâmica
// em backend/.claude/skills/<nome>/SKILL.md no boot. Backend fica intacto quando
// uma bridge nova adiciona sua skill — basta dropar o SKILL.md e reiniciar.
// Sem skillName, vira chat livre — útil pra debug/probe ("diga oi" sem ferramentas).

const fs = require('fs');
const path = require('path');
const { query } = require('../../claude-query');

// Skills shipadas pelo CLI claude (não vivem em backend/.claude/skills/)
const BUILTIN_SKILLS = new Set([
  'simplify',
  'review',
  'security-review',
  'init',
  'claude-api',
]);

// Descobre skills locais escaneando backend/.claude/skills/<nome>/SKILL.md.
// Faz o backend ficar intacto quando uma bridge nova adiciona sua skill.
function loadLocalSkills() {
  const skillsDir = path.join(__dirname, '..', '..', '.claude', 'skills');
  const found = new Set();
  if (!fs.existsSync(skillsDir)) return found;
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    const fullPath = path.join(skillsDir, entry.name);
    let isDir;
    try {
      isDir = fs.statSync(fullPath).isDirectory();
    } catch (_) {
      continue;
    }
    if (!isDir) continue;
    const skillFile = path.join(fullPath, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    let skillName = entry.name;
    try {
      const head = fs.readFileSync(skillFile, 'utf8').slice(0, 1024);
      const match = head.match(/^name:\s*(.+)$/m);
      if (match) skillName = match[1].trim();
    } catch (_) { /* fallback: nome do diretório */ }
    found.add(skillName);
  }
  return found;
}

// Skills sensíveis que NÃO devem ser expostas via HTTP `/api/skills/run`
// (continuam funcionando como slash command no CLI). Defaults bloqueiam
// operações destrutivas em git, filesystem e workflow autônomo.
// Estender via env: SKILLS_HTTP_DENY="skill-x,skill-y"
const BUILTIN_HTTP_DENY = new Set([
  'puro-undo',              // reverte commits
  'puro-cleanup',           // arquiva fases
  'puro-execute-phase',     // executa código autonomamente
  'puro-remove-workspace',  // apaga worktrees
  'puro-from-gsd2',         // migração destrutiva
  'puro-reapply-patches',   // reescreve git
  'puro-autonomous',        // executa todas as fases sem revisão
  'puro-audit-fix',         // pipeline auto-fix
  'puro-pr-branch',         // mexe em git remoto
  'puro-ship',              // cria PR
]);
const ENV_HTTP_DENY = (process.env.SKILLS_HTTP_DENY || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const HTTP_DENY = new Set([...BUILTIN_HTTP_DENY, ...ENV_HTTP_DENY]);

const SKILLS_ALLOWED = new Set(
  [...BUILTIN_SKILLS, ...loadLocalSkills()].filter(s => !HTTP_DENY.has(s))
);

function extractText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(c => c && c.type === 'text' && c.text)
      .map(c => c.text)
      .join('');
  }
  if (content.text) return content.text;
  return JSON.stringify(content).slice(0, 500);
}

async function handle(body = {}) {
  const startedAt = Date.now();
  const {
    skillName,
    prompt,
    maxTurns = 5,
    allowedTools = [],
    timeoutMs = 120000,
    model,
  } = body;

  // Validações
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return { ok: false, error: 'prompt obrigatório (string não vazia)' };
  }
  if (skillName && !SKILLS_ALLOWED.has(skillName)) {
    return {
      ok: false,
      error: `skill '${skillName}' não está na whitelist. Permitidas: ${Array.from(SKILLS_ALLOWED).join(', ')}`,
    };
  }

  // Monta prompt final: se tem skillName, prefixa com /skillName
  const finalPrompt = skillName ? `/${skillName} ${prompt}` : prompt;

  // AbortController com timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  let assistantText = '';
  let resultEvent = null;
  const messages = [];
  let modelUsed = null;
  const stderrChunks = [];

  try {
    for await (const msg of query({
      prompt: finalPrompt,
      options: {
        maxTurns,
        permissionMode: 'bypassPermissions',
        allowedTools,
        model,
        abortController,
        stderr: (data) => { stderrChunks.push(data.toString().slice(0, 500)); },
      },
    })) {
      messages.push({ type: msg.type, subtype: msg.subtype });

      if (msg.type === 'system' && msg.subtype === 'init') {
        modelUsed = msg.model;
      }
      if (msg.type === 'assistant' && msg.message && msg.message.content) {
        assistantText += extractText(msg.message.content);
      }
      if (msg.type === 'result') {
        resultEvent = msg;
        break; // result é sempre o último
      }
    }
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      ok: false,
      error: `query() falhou: ${err.message}`,
      durationMs: Date.now() - startedAt,
      stderr: stderrChunks.slice(-3).join('\n').slice(0, 1000),
    };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!resultEvent) {
    return {
      ok: false,
      error: 'query() encerrou sem evento result (provavelmente timeout ou abort)',
      durationMs: Date.now() - startedAt,
      messagesCount: messages.length,
      stderr: stderrChunks.slice(-3).join('\n').slice(0, 1000),
    };
  }

  if (resultEvent.is_error) {
    return {
      ok: false,
      error: resultEvent.result || resultEvent.error || 'erro desconhecido no Claude',
      durationMs: Date.now() - startedAt,
    };
  }

  const finalText = typeof resultEvent.result === 'string'
    ? resultEvent.result
    : (assistantText || JSON.stringify(resultEvent.result || {}).slice(0, 500));

  return {
    ok: true,
    result: finalText,
    skillName: skillName || null,
    model: modelUsed || resultEvent.model || null,
    turns: resultEvent.num_turns || 1,
    durationMs: Date.now() - startedAt,
    costUsd: resultEvent.total_cost_usd || 0,
    messagesCount: messages.length,
  };
}

module.exports = { handle, SKILLS_ALLOWED };
