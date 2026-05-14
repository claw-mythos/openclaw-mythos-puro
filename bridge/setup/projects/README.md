# bridge/projects

Integração com os **projects do Claude Code** — leitura e gestão das sessões/transcripts armazenadas pelo CLI `claude` em `~/.claude/projects/`.

## Princípio arquitetural

**Tudo passa pelo Claude SDK.** O backend não toca em `~/.claude/projects/` diretamente — ele expande a skill `projects`, o subprocesso `claude` lê o filesystem com `Bash` (`ls`, `tail`, `grep`, `jq`), e devolve o resumo no streaming.

```
[cliente openclaw]
       │
       │ POST /api/skills/run { skillName: "projects", prompt: "liste sessões ativas" }
       ▼
[backend/server.js]
       │
       │ run-skill.js → claude-query.js
       ▼
[claude CLI subprocess]
       │
       │ skill instrui usar Bash em ~/.claude/projects/<slug>/*.jsonl
       ▼
[filesystem local]
       │
       │ devolve metadados + trechos relevantes
       ▼
[backend devolve resposta no streaming]
```

`bridge/projects/` não contém código Node executável — só docs, exemplos e o conteúdo-fonte da skill (que vive em `backend/.claude/skills/projects/SKILL.md`).

## Fonte de dados

Cada **project** do Claude Code corresponde a um `cwd` específico, mapeado pra um slug pela transformação:

```
/Users/2a/.claude/openclaw-mythos-puro
       │ replace '/' → '-'
       ▼
-Users-2a--claude-openclaw-mythos-puro
```

Dentro de `~/.claude/projects/<slug>/`:

| Arquivo/dir | Conteúdo |
|---|---|
| `<sessionId>.jsonl` | NDJSON com toda a conversa: prompts do usuário, respostas do assistant, tool_uses, tool_results, timestamps, `cwd`, `gitBranch`, `slug` |
| `memory/` | Memórias persistentes (`MEMORY.md` + arquivos por tópico) |

Cada linha do `.jsonl` é um evento JSON com campos típicos:

```json
{
  "type": "assistant" | "user" | "attachment",
  "sessionId": "78a3b879-...",
  "cwd": "/Users/2a/.claude/openclaw-mythos-puro/backend-sdk-claude",
  "slug": "parallel-tickling-quasar",
  "timestamp": "2026-05-13T12:56:53.048Z",
  "message": { "role": "...", "content": [...] },
  "toolUseResult": { ... }
}
```

## Pré-requisitos

1. **`claude login` ativo** — backend spawn herda `~/.claude/` do usuário do processo.
2. **`API_BEARER_SECRET` no `.env`** do backend.
3. **Skill `projects`** em `backend/.claude/skills/projects/SKILL.md`. Auto-descoberta pelo backend a partir da feature de discovery em `run-skill.js` — não precisa editar whitelist.
4. **Backend iniciado FORA do sandbox restritivo do shell** (mesma restrição do `bridge/gamma`).

## Como usar

### Via endpoint REST

```bash
curl -X POST http://localhost:3457/api/skills/run \
  -H "Authorization: Bearer $API_BEARER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "skillName": "projects",
    "prompt": "Liste as sessões ativas neste projeto na última hora e diga o que cada uma está fazendo.",
    "maxTurns": 5,
    "allowedTools": ["Bash"],
    "timeoutMs": 60000
  }'
```

### Via Socket.IO (chat principal)

```
/projects

Liste sessões ativas no openclaw-mythos-puro agora.
```

## Casos de uso

| Pergunta | O que a skill faz |
|---|---|
| "Quem está mexendo neste projeto agora?" | `ls -lt ~/.claude/projects/<slug>/*.jsonl` filtrando por `mtime` recente |
| "Resume os últimos 10 eventos da sessão X" | `tail` + filtro por `type=user/assistant` no `.jsonl` da sessão |
| "Tem algum terminal editando `claude-query.js`?" | `grep '"file_path":".*claude-query.js"'` em todos `.jsonl` recentes |
| "Quais comandos rodaram nas últimas 24h?" | `grep '"description":"[^"]*"'` agrupado por sessionId |
| "Qual sessão tem `slug: parallel-tickling-quasar`?" | `grep -l '"slug":"parallel-tickling-quasar"' *.jsonl` |
| "Lista todos os projects do Claude Code" | `ls ~/.claude/projects/` + tradução slug→cwd |

## Cuidados

| Risco | Mitigação |
|---|---|
| **Privacidade**: `.jsonl` contém prompts crus do usuário, paths internos, output de tools | Endpoint exige `Authorization: Bearer`. Skill **não** ecoa conteúdo sensível por padrão — resume e cita. |
| **Performance**: arquivos chegam a 100s de KB | Skill **nunca usa `cat`** — sempre `tail -c`, `tail -n`, `grep`, `head` |
| **Ruído**: `tool_use`/`tool_result` poluem | Skill filtra por `type=user/assistant` quando o usuário pede "conversa", e por `description` quando pede "ações" |
| **Identificar sessão atual**: pra excluir o próprio terminal do listing | Quem chama informa `currentSessionId` opcional no prompt |

## Adicionando nova skill ao bridge/projects

Se aparecer um caso de uso que vire skill própria (ex.: `projects-watch` pra monitoramento contínuo), siga o padrão em `bridge/gamma/README.md` § "Adicionando uma nova integração ao bridge/".

Backend permanece limpo — só conhece skills, não conhece o filesystem `~/.claude/projects/`.
