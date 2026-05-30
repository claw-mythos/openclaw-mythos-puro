# Backend SDK Claude — versão `puro`

Este diretório é uma **base limpa** do backend Node.js que orquestra sessões Claude Code via HTTP + Socket.IO. Pensado pra ser usado como **fundação** que outras instâncias (`lucrecia`, futuras) estendem com bridges de domínio.

## Modelo de uso — SDK intercambiável (drop-in)

Este SDK é uma **peça de motor lacrada e genérica**. Ele **não sabe nada** sobre nenhuma
instância: no boot, o `bridge-loader` simplesmente varre o diretório-pai atrás de qualquer
pasta `../bridge-*/index.js` e a carrega. Não há nenhuma string `lucrecia`/`whatsapp`/`opensign`
no código do SDK.

Consequência prática (o objetivo do dono): o SDK é **trocável por cópia**. Quando este `puro`
ganhar uma melhoria, dá pra **apagar a pasta do SDK numa instância e colar a deste repo** —
sem ruído, sem conflito, sem mexer em nada da bridge.

**A única regra que faz o drop-in funcionar:** nada específico de uma instância pode morar
**dentro** da pasta do SDK. Os 4 itens de instância ficam **fora** dele (todos no `.gitignore`):

| Item de instância | Onde mora | Como sobrevive a um swap |
|---|---|---|
| Segredos (`.env`, `.secrets`) | na instância / `bridge-*/.secrets` | recriados/symlinkados após o swap |
| Estado vivo (`data/*`) | `data/` (gitignored) | preservado no swap (não deletar) |
| Workspaces (`grupos/*`) | dentro da `bridge-*` | a bridge popula; SDK só tem `grupos/.gitkeep` |
| `node_modules/` | gerado | `npm ci` após o swap |

Receita do swap (futuro): `git pull` no `puro` → numa instância, salvar `.env`/`.secrets`/`data`
de lado → `rm -rf backend-sdk-claude && cp -r <puro>/backend-sdk-claude .` → restaurar os itens
salvos → `npm ci` → reiniciar → smoke (`/api/health` + log `[bridge-loader] loaded <bridge> (+N crons)`).

## Arquitetura visual

![Anatomia do Backend: Claude Code Bridge Server](./image.png)

3 camadas:

- **Camada 1 — Borda e API** (`server.js`): rotas REST (HTTP POST/GET) + Socket.IO pra streaming em tempo real. Ponto de entrada pros clientes externos.
- **Camada 2 — Serviços de Domínio**: `task-runner.js` (fila + worker pool de tasks Claude assíncronas, persistência em `data/tasks.json`), `memory-store.js` (key-value de contexto com SHA256 de precondition pra evitar race), `health-checker.js` (monitora processos, uso de memória, Socket.IO).
- **Camada 3 — Adaptador Claude** (`claude-query.js`): coração operacional que spawn-eia o CLI Claude Code via subprocess. Controle de concorrência (semáforo `MAX_PROCESSES` + throttle por memória `MEMORY_THROTTLE_PERCENT`) limita processos paralelos pra evitar OOM. Streaming de eventos NDJSON re-emitidos pro Socket.IO.

Fluxo de uma task: cliente faz `POST /api/tasks` → `task-runner` enfileira → quando libera slot, chama `query()` do `claude-query` → spawn do CLI → eventos do stdout viram `task_step` no Socket.IO → resultado final em `task_done` + persistência em `data/tasks.json`.

> Diagrama gerado com NotebookLM, validado contra o código atual.

## Posicionamento

- **`puro`** (aqui) — fundação genérica **+ plugin loader** (`services/bridge-loader.js`). O motor: task runner, claude-query wrapper, sessions HTTP, agents runner, health/upload/export, auth bearer, Socket.IO, e o `bridge-loader` que descobre e carrega `../bridge-*/index.js` no boot. **Sem** integração com canal (WhatsApp/Telegram/Discord) e **sem** bridge concreta — essas moram numa instância (ex.: `lucrecia`).
- **`lucrecia`** (irmão em `/home/lucrecia/openclaw-mythos-lucrecia/backend-sdk-claude/`) — instância viva. Tem WhatsApp via wuzapi, ElevenLabs+HeyGen, OpenSign automation, NDA executor, dossier post-signature, etc. Estende `puro` com bridge-loader + grupos + CLAUDE.md por workspace.

Quando bater dúvida "isso é genérico ou específico?" — se for **canal/grupo/automação de domínio**, mora no `lucrecia` (ou em uma instância nova). Se for **motor**, mora aqui.

## Como escrever uma bridge (contrato do plugin)

O `bridge-loader.js` já faz parte do motor. Pra ligar qualquer domínio (WhatsApp, OpenSign,
CRM, faturas...) ao motor **sem tocar no `server.js`/`task-runner.js`**, basta criar uma pasta
irmã `../bridge-<nome>/` com um `index.js` que exporta `init(ctx)`:

```js
// ../bridge-<nome>/index.js
async function init(ctx) {
  // webhook autenticado por bearer (envs ausentes → 500; bearer errado → 401)
  ctx.registerWebhook('/api/meu-webhook', async (body, headers, req) => {
    return { ok: true };
  }, { bearerEnv: 'MEU_WEBHOOK_SECRET' });

  // rota HTTP crua (quando precisa de req/res direto, route params, etc.)
  ctx.registerHttpHandler('post', '/api/algo/:id', async (req, res) => res.json({ id: req.params.id }));

  // crons (tick por minuto, fuso America/Sao_Paulo)
  ctx.registerCron({ name: 'meu-job', hourBR: 7, minuteBR: 0, fn: async () => { /* ... */ } });
  ctx.registerCronRegistry(require('./crons')); // ou um módulo que exporta { JOBS: [...] }

  // eventos de socket, se precisar
  ctx.registerSocketEvent('meu_evento', (socket, data, ack) => { /* ... */ });
}
module.exports = { init };
```

O `ctx` que o `init` recebe oferece: `app`, `io`, `logger`, `taskRunner`,
`sessionContextManager`, `healthChecker`, `claudeQuery`, `paths` (`backendRoot`, `bridgeRoot`,
`dataDir`, `secretsDir`) + os 5 registradores (`registerHttpHandler`, `registerWebhook`,
`registerCron`, `registerCronRegistry`, `registerSocketEvent`). Falha no `init` de uma bridge
é **isolada**: o motor sobe sem ela e loga o erro.

**Exemplo canônico real** (em vez de um exemplo sintético): leia
`../bridge-lucrecia/index.js` na instância `lucrecia` — um `init(ctx)` de produção que registra
~22 webhooks + ~11 rotas HTTP + um registry de crons (CRM, OpenSign, Twenty, faturas, Tábula).
É a referência viva de como uma bridge de domínio se conecta a este SDK.

### 2. `grupos/<nome>/CLAUDE.md` — contexto vivo por workspace

Estrutura no `lucrecia`: `grupos/lucrecia/CLAUDE.md`, `grupos/faturas/CLAUDE.md`. Aqui no `puro` existem as pastas `grupos/faturas/` e `grupos/puro/` (vazias) — esqueleto pronto.

Pra quê: cada subpasta em `grupos/` representa um **workspace dedicado** pra uma sessão (grupo WhatsApp, time de vendas, fluxo específico). O `CLAUDE.md` dentro carrega contexto vivo daquele workspace — convenções, vocabulário, regras de negócio, integrações ativas. Quando uma task roda com `workspace=grupos/<nome>`, o CLI Claude lê esse `CLAUDE.md` automaticamente e a sessão fica "contextualizada" pro grupo.

Quando portar: se você quer separar contextos de sessão (ex: "sessão pra atendimento jurídico" vs "sessão pra ops financeiras") sem rebuild de prompt cada vez.

### 3. Rotas HTTP — são motor genuíno

As rotas atuais (`/api/health`, `/api/upload`, `/api/export`, `/api/sessions`, `/api/tasks`, `/api/agents`) **são o motor** — não específicas de canal. Já estão aqui no `puro`, foram preservadas no cleanup `cleanup/dead-code`. Listadas aqui pra você saber que **pode contar com elas** em qualquer extensão futura.

Documentação rápida (referência rápida — pra detalhe, leia o `server.js`):

| Rota | Método | Pra quê |
|---|---|---|
| `/api/health` | GET | status dos componentes + cache 30s |
| `/api/upload` | POST | upload de arquivo texto/código (10MB max) |
| `/api/export` | POST | exporta conversa em md ou json |
| `/api/sessions` | GET/DELETE | gerenciar sessions in-memory do chat WebSocket |
| `/api/tasks` | POST/GET/DELETE | task runner — fila + worker pool + retry |
| `/api/agents` | GET | lista subagents disponíveis (de `~/.claude/agents/`) |
| `/api/agents/run` | POST | dispara subagent específico |

## O que **NÃO** portar do `lucrecia`

Foi limpo do `puro` no commit cleanup e não deve voltar — é específico da instância:

- Paths hardcoded `/Users/2a/.openclaw/...` (máquina antiga do Lucas em Mac)
- Rotas Instagram (`/api/translate-instagram`, `/api/instagram-stories`, `/api/translate-image`)
- Slash commands de domínio (`/auto-commit-pr`, `/self-review`, `/analyze-logs`, `/eval-skills`, `/self-improve`)
- Modo autônomo com `SELF_MISSIONS`/`OPENCLAW_MISSIONS` (re-implementar como standing-orders do OpenClaw é melhor)
- Denylist `BUILTIN_HTTP_DENY` apontando pra agentes `puro-*` inexistentes
- Rota `/api/claude-reset-info` (sempre retornava `{success:false}`)
- Rota `/api/preencher/declaracao-residencia` (módulo `services/pdf-filler/` foi removido)
- Rota `/api/skills/run` (módulo `services/skills/` foi removido)

Se uma instância nova precisar dessas features, **prefere reimplementar com paths via env vars** (`MYTHOS_WORKSPACE`, `MYTHOS_STATE_DIR`) ao invés de hardcode.

## Convenções do `puro`

### Encoding de workspace → pasta no `~/.claude/projects/`

O CLI Claude grava transcript em `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`. O `<encoded-cwd>` substitui **apenas** `/` por `-` (não `.`). Exemplo:

```
/home/lucrecia/openclaw-mythos-puro/backend-sdk-claude/grupos/faturas
→ -home-lucrecia-openclaw-mythos-puro-backend-sdk-claude-grupos-faturas
```

### Symlink `symlink/projects/`

Há symlink local em `symlink/projects → ~/.claude/projects/` (gitignored). Use pra inspecionar transcripts de qualquer projeto Claude Code da máquina **sem sair do contexto deste repo**. Skill `recriar-symlink-projects` recria se sumir.

### Skills locais

`.claude/skills/` tem 3 skills:
- `recriar-symlink-projects.md` — restaura o symlink + entry do gitignore
- `rodar-sessao-em-workspace.md` — dispara task no backend e mostra JSONL aparecendo via symlink
- `projects-absorb.md` — preserva sessão atual e apaga as outras (rm, com gate `deleteConfirmed`)

Quando criar skill nova: frontmatter `name` + `description` com triggers ("Use SEMPRE que..."), seções claras de **Quando usar**, **Parâmetros**, **Passos**, **Regras de segurança**, **O que NUNCA fazer**.

### Bug fix histórico — `spawn node ENOENT`

`claude-query.js` agora trata o evento `error` do `ChildProcess` (sem isso, qualquer falha de spawn — `node` fora do PATH, EACCES, etc — derruba o processo inteiro). **NÃO remover** esse handler.

### Cleanup de dead code

Branch `cleanup/dead-code` (3 commits) já removeu ~6500 linhas mortas. Antes de adicionar feature nova, lembre: se for "conexão concreta com OpenClaw/canal/instância", **NÃO** mora aqui — mora em outra instância.

## Roadmap pendente (não-trivial — exige discussão)

Itens que o Lucas sinalizou pra alinhamento com a arquitetura OpenClaw (gateway pattern), mas que **não foram implementados** porque pedem PR próprio com design:

1. Contrato genérico em `POST /api/tasks` — receber `agentId`, `sessionKey`, `channel`, `peer` (espelhar modelo OpenClaw sem implementar canais aqui)
2. Paths via env vars — `MYTHOS_WORKSPACE`, `MYTHOS_STATE_DIR`, `MYTHOS_AGENTS_DIR`
3. Persistência de sessão por `agentId/sessionKey` (não só in-memory)
4. Análise se `socket.on('analyze_file')` em `server.js:1110-...` é dead code ou tem cliente real (hoje faz `socket.emit('send_message')` no servidor, que é no-op)

Quando atacar, criar plan em `~/.claude/plans/` e PR separado.
