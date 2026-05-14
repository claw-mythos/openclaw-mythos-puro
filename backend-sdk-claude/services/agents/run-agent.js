// Handler — POST /api/agents/run
//
// Dispara um agente Claude Code (.md em ~/.claude/agents/) via Task tool interno
// do CLI claude. O agente .md NÃO é passado como flag — o CLI v2 não suporta
// --agent. Em vez disso, montamos prompt instrutivo "Use the Task tool with
// subagent_type='X' and prompt: ..." e forçamos allowedTools: ['Task']. O CLI
// então descobre o agente via ~/.claude/agents/<name>.md automaticamente.
//
// Body:
//   {
//     "agent": "puro-pattern-mapper",       // obrigatório (whitelist)
//     "prompt": "...",                     // obrigatório
//     "maxTurns": 10,                      // default 10
//     "timeoutMs": 300000,                 // default 5min (agentes são lentos)
//     "model": "claude-opus-4-6"           // opcional
//   }
//
// Response idêntico a run-skill: { ok, result, model, turns, durationMs, costUsd }

const fs = require('fs');
const path = require('path');
const { query } = require('../../claude-query');

const AGENTS_PATH = process.env.CLAUDE_AGENTS_PATH || path.join(process.env.HOME || '', '.claude', 'agents');

// Agentes que escrevem código / mexem em git / são autônomos demais — bloqueados
// no HTTP por default. Continuam invocáveis via Task tool dentro do Claude Code CLI.
// Estender via env: AGENTS_HTTP_DENY="agent-x,agent-y"
const BUILTIN_HTTP_DENY = new Set([
  'puro-executor',          // escreve código
  'puro-code-fixer',        // edita arquivos
  'puro-debugger',          // edita arquivos
  'puro-debug-session-manager',
  'puro-nyquist-auditor',   // escreve testes
  'puro-security-auditor',  // edita arquivos
]);
const ENV_HTTP_DENY = (process.env.AGENTS_HTTP_DENY || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const HTTP_DENY = new Set([...BUILTIN_HTTP_DENY, ...ENV_HTTP_DENY]);

// Descobre agentes lendo o frontmatter name: de cada .md em AGENTS_PATH
function loadAgents() {
  const found = new Set();
  if (!fs.existsSync(AGENTS_PATH)) return found;
  for (const entry of fs.readdirSync(AGENTS_PATH)) {
    if (!entry.endsWith('.md')) continue;
    const full = path.join(AGENTS_PATH, entry);
    let name = entry.replace(/\.md$/, '');
    try {
      const head = fs.readFileSync(full, 'utf8').slice(0, 1024);
      const m = head.match(/^name:\s*(.+)$/m);
      if (m) name = m[1].trim();
    } catch (_) { /* fallback: filename */ }
    found.add(name);
  }
  return found;
}

const AGENTS_ALLOWED = new Set(
  [...loadAgents()].filter(a => !HTTP_DENY.has(a))
);

function listAgents() {
  return Array.from(AGENTS_ALLOWED).sort();
}

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
    agent,
    prompt,
    maxTurns = 10,
    timeoutMs = 300000,
    model,
  } = body;

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return { ok: false, error: 'prompt obrigatório (string não vazia)' };
  }
  if (!agent || typeof agent !== 'string') {
    return { ok: false, error: 'agent obrigatório (string com nome do subagent)' };
  }
  if (!AGENTS_ALLOWED.has(agent)) {
    return {
      ok: false,
      error: `agent '${agent}' não está na whitelist. Permitidos: ${Array.from(AGENTS_ALLOWED).slice(0, 10).join(', ')}${AGENTS_ALLOWED.size > 10 ? '…' : ''}`,
    };
  }

  // Escape de aspas simples no prompt do usuário pra não quebrar o template
  const safePrompt = prompt.replace(/'/g, "\\'");
  const instructed = `Use the Task tool with subagent_type='${agent}' and prompt: '${safePrompt}'. Report only the agent's final result, verbatim.`;

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  let assistantText = '';
  let resultEvent = null;
  const messages = [];
  let modelUsed = null;
  const stderrChunks = [];

  try {
    for await (const msg of query({
      prompt: instructed,
      options: {
        maxTurns,
        permissionMode: 'bypassPermissions',
        allowedTools: ['Task'],
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
        break;
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
    agent,
    model: modelUsed || resultEvent.model || null,
    turns: resultEvent.num_turns || 1,
    durationMs: Date.now() - startedAt,
    costUsd: resultEvent.total_cost_usd || 0,
    messagesCount: messages.length,
  };
}

module.exports = { handle, listAgents, AGENTS_ALLOWED };
