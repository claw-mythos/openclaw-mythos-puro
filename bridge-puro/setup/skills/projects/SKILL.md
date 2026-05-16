---
name: projects
description: Inspeciona transcripts e sessões do Claude Code armazenados em ~/.claude/projects/. Use quando o usuário perguntar "que sessões estão ativas neste projeto", "o que outro terminal está fazendo", "quem está editando o arquivo X", "resume a sessão Y", "histórico de comandos rodados aqui", "quais projects existem no Claude Code". Leitura privilegiada — sempre via Bash em ~/.claude/projects/. Totalmente portável: nenhum path da máquina do usuário é hardcoded.
---

# Skill: projects

## Quando usar

Acione esta skill quando o usuário quiser visibilidade sobre **sessões do Claude Code** (transcripts em `~/.claude/projects/`):

- "Quais projects existem no meu Claude Code?"
- "Que sessões estão ativas neste projeto agora?"
- "O outro terminal terminou aquela tarefa?"
- "Tem alguém mexendo no arquivo X?"
- "Resume os últimos 10 minutos da sessão Y"
- "Qual sessão está com cwd backend/?"
- "Quais comandos rodaram nas últimas N horas?"

## Estrutura dos dados

```
$HOME/.claude/projects/                  ← raiz (sempre $HOME, nunca hardcoded)
  <slug-A>/
    <sessionId>.jsonl                    ← NDJSON com a conversa
    memory/                              ← memórias persistentes (read-only nesta skill)
  <slug-B>/
    ...
```

**Slug** = path absoluto do `cwd` com `/` **e** `.` substituídos por `-`:

```
/Users/<nome>/.claude/projeto
       │ s|[/.]|-|g
       ▼
-Users--nome--claude-projeto
```

A regra `[/.]` é importante — `.claude/` (oculto) vira `--claude-` (dois hífens). **Sempre use `[/.]` no sed**, nunca só `/`, ou o slug não bate com o filesystem.

**Não tente decodificar o slug → cwd via string manipulation** — informação se perde (não dá pra saber se um `-` veio de `/`, `.` ou era literal). Use `jq` no `.jsonl` pra extrair o `cwd` real (campo confiável).

Cada linha do `.jsonl` é um evento JSON. Campos típicos por tipo:

| `type` | Tem `cwd`? | Tem `sessionId`? | Tem `slug`? | Conteúdo |
|---|---|---|---|---|
| `system` (init) | ❌ | ❌ | ❌ | inicialização — **não use pra extrair cwd** |
| `user` | ✅ | ✅ | às vezes | prompt humano OU tool_result |
| `assistant` | ✅ | ✅ | às vezes | resposta + tool_uses |
| `attachment` | ✅ | ✅ | às vezes | anexos, output_style, etc. |

**Regra de ouro:** pra extrair `cwd`/`slug`, **não use `head -1`** — pode pegar `system`. Use:

```bash
jq -r 'select(.cwd) | .cwd' "$JSONL" | head -1
jq -r 'select(.slug) | .slug' "$JSONL" | head -1
```

## Comandos canônicos (todos portáveis — usam `$HOME` e `pwd`)

### 1. Listar TODOS os projects do Claude Code

Use quando o usuário não especificou projeto e quer ver o que existe na máquina:

```bash
PROJECTS_ROOT="$HOME/.claude/projects"
NOW=$(date +%s)

printf "%-50s %-7s %-14s %s\n" "SLUG" "SESSÕES" "ÚLT.ATIVIDADE" "CWD"
printf "%-50s %-7s %-14s %s\n" "----" "-------" "-------------" "---"

for dir in "$PROJECTS_ROOT"/*/; do
  [ -d "$dir" ] || continue
  SLUG=$(basename "$dir")
  COUNT=$(find "$dir" -maxdepth 1 -name '*.jsonl' 2>/dev/null | wc -l | tr -d ' ')
  LATEST=$(find "$dir" -maxdepth 1 -name '*.jsonl' -exec stat -f "%m %N" {} + 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)

  if [ -z "$LATEST" ]; then
    AGE_STR="(sem sessões)"; CWD="?"
  else
    AGE_MIN=$(( (NOW - $(stat -f %m "$LATEST")) / 60 ))
    if   [ "$AGE_MIN" -lt 60 ];   then AGE_STR="${AGE_MIN}min atrás"
    elif [ "$AGE_MIN" -lt 1440 ]; then AGE_STR="$((AGE_MIN/60))h atrás"
    else                               AGE_STR="$((AGE_MIN/1440))d atrás"
    fi
    CWD=$(jq -r 'select(.cwd) | .cwd' "$LATEST" 2>/dev/null | head -1)
    [ -z "$CWD" ] && CWD="(não detectado)"
  fi

  printf "%-50s %-7s %-14s %s\n" "${SLUG:0:48}" "$COUNT" "$AGE_STR" "$CWD"
done
```

### 2. Detectar slug do projeto ATUAL

Sempre dinâmico — derivado de `pwd`, nunca hardcoded:

```bash
SLUG=$(pwd | sed 's|[/.]|-|g')
PROJECTS_DIR="$HOME/.claude/projects/$SLUG"
ls -d "$PROJECTS_DIR" 2>/dev/null || echo "Sem sessões para este cwd ainda."
```

### 3. Listar sessões ativas no projeto atual (últimos N min)

```bash
SLUG=$(pwd | sed 's|[/.]|-|g')
PROJECTS_DIR="$HOME/.claude/projects/$SLUG"

find "$PROJECTS_DIR" -maxdepth 1 -name '*.jsonl' -mmin -60 | while read f; do
  SID=$(basename "$f" .jsonl | cut -c1-8)
  SIZE=$(ls -lh "$f" | awk '{print $5}')
  CWD=$(jq -r 'select(.cwd) | .cwd' "$f" 2>/dev/null | head -1)
  SLUG_INNER=$(jq -r 'select(.slug) | .slug' "$f" 2>/dev/null | head -1)
  LAST_TS=$(tail -c 4000 "$f" | tail -1 | jq -r '.timestamp // "?"')
  echo "$SID | $SIZE | cwd=$CWD | slug=$SLUG_INNER | last=$LAST_TS"
done
```

### 4. Listar sessões de um projeto específico (por slug)

```bash
TARGET_SLUG="<slug-fornecido-pelo-usuario>"   # quem chama informa
PROJECTS_DIR="$HOME/.claude/projects/$TARGET_SLUG"

[ -d "$PROJECTS_DIR" ] || { echo "Projeto $TARGET_SLUG não existe."; exit 1; }

# (mesmo loop do item 3, com $PROJECTS_DIR já apontado pro alvo)
```

### 5. Última ação real de uma sessão (filtrar tool_use de Bash)

```bash
SLUG=$(pwd | sed 's|[/.]|-|g')
JSONL="$HOME/.claude/projects/$SLUG/<sessionId>.jsonl"

# Últimas 5 descriptions de Bash
jq -r 'select(.message.content) | .message.content[]? | select(.type=="tool_use" and .name=="Bash") | .input.description' "$JSONL" 2>/dev/null | tail -5

# Últimos 5 prompts humanos (ignora tool_results)
jq -r 'select(.type=="user" and (.message.content | type=="string")) | .message.content' "$JSONL" 2>/dev/null | tail -5
```

**Não use `grep '"description"'` cru** — pega descriptions de tool_results aninhados também, gerando ruído.

### 6. Detectar conflito de edição em arquivo

```bash
SLUG=$(pwd | sed 's|[/.]|-|g')
PROJECTS_DIR="$HOME/.claude/projects/$SLUG"
TARGET="<nome-do-arquivo>"
CURRENT_SESSION="<sessionId-atual>"   # quem chama informa

find "$PROJECTS_DIR" -maxdepth 1 -name '*.jsonl' -mmin -10 | while read f; do
  SID=$(basename "$f" .jsonl)
  [[ "$SID" == "$CURRENT_SESSION"* ]] && continue
  HITS=$(jq -r 'select(.message.content) | .message.content[]? | select(.type=="tool_use" and (.name=="Edit" or .name=="Write")) | .input.file_path // empty' "$f" 2>/dev/null | grep -c "$TARGET")
  [ "$HITS" -gt 0 ] && echo "⚠️  Sessão ${SID:0:8} tocou em $TARGET ($HITS edições)"
done
```

### 7. Resumir sessão específica

```bash
SLUG=$(pwd | sed 's|[/.]|-|g')
JSONL="$HOME/.claude/projects/$SLUG/<sessionId>.jsonl"

echo "=== Tamanho ==="
ls -lh "$JSONL" | awk '{print $5, $6, $7, $8}'

echo "=== Prompts humanos (últimos 5) ==="
jq -r 'select(.type=="user" and (.message.content | type=="string")) | "\(.timestamp): \(.message.content)"' "$JSONL" | tail -5

echo "=== Arquivos editados (únicos) ==="
jq -r 'select(.message.content) | .message.content[]? | select(.type=="tool_use" and (.name=="Edit" or .name=="Write")) | .input.file_path // empty' "$JSONL" | sort -u

echo "=== Últimas 5 ações Bash ==="
jq -r 'select(.message.content) | .message.content[]? | select(.type=="tool_use" and .name=="Bash") | .input.description' "$JSONL" | tail -5

echo "=== Estado final ==="
tail -1 "$JSONL" | jq '{type, timestamp, stop_reason: .message.stop_reason}'
```

## Princípios

- **Portabilidade:** **zero hardcode.** Sempre `$HOME/.claude/projects/`, nunca `/Users/<nome>/...`. Slug do projeto atual sempre via `pwd | sed 's|[/.]|-|g'`.
- **Performance:** **nunca use `cat` no `.jsonl` inteiro.** Sempre `tail -c`, `tail -n`, `head`, ou `jq` com filtro. Arquivos chegam a centenas de KB.
- **Privacidade:** `.jsonl` contém prompts crus do usuário. Resuma e cite — **nunca ecoe blocos grandes** sem necessidade explícita do usuário. Se for incluir prompt, trunque (`head -c 200`).
- **Excluir sessão atual:** quem chama deve informar `currentSessionId`. Skill **não deve** auto-detectar (não tem como saber qual sessão está rodando o subprocess do CLI).
- **Sem escrita:** esta skill é **read-only**. Nunca edite/apague `.jsonl` ou `memory/`. Cleanup é responsabilidade da skill `projects-cleanup` (separada).

## Falhas comuns e como evitar

| Sintoma | Causa | Fix |
|---|---|---|
| `cwd: ?` em todas sessões | Usou `head -1` que pegou `system` event | Use `jq 'select(.cwd) \| .cwd' \| head -1` |
| descriptions duplicadas/sujas | `grep '"description"'` pega `tool_result` também | Use `jq` filtrando `select(.type=="tool_use" and .name=="Bash")` |
| Lista vazia mas há sessões | Filtro `-mmin -N` muito restritivo | Aumente N ou troque por `-mtime -1` (24h) |
| `ugrep: No such file` | Arquivo bloqueado por sandbox (ex: `.env`) | Esta skill só lê `~/.claude/projects/` — caminho livre |
| `jq: error: Cannot iterate over null` | Linha sem `.message.content` (ex: attachment) | Use `?` em todo `.[]?` (já feito acima) |
| Path `/Users/<nome>/...` no comando | Hardcode acidental — quebra em outras máquinas | Use `$HOME` + `pwd` sempre |

## O que NUNCA fazer

- ❌ Hardcodar `/Users/<seu-nome>/...` ou qualquer path absoluto da máquina específica.
- ❌ Despejar `.jsonl` inteiro como output (gigantes — mata o context window do caller).
- ❌ Modificar arquivos em `~/.claude/projects/`.
- ❌ Citar prompts do usuário literalmente sem truncar — pode vazar dados sensíveis.
- ❌ Tentar adivinhar `currentSessionId` — sempre exigir do caller.
- ❌ Usar `grep` cru pra extrair JSON — sempre `jq`.
- ❌ Decodificar slug → cwd por string manipulation. Sempre via `jq` no `.jsonl`.

## Exemplo de invocação

### Via chat (qualquer Claude no terminal)

```
/projects

Liste todos os projects no meu Claude Code, ordenados por última atividade.
Pra cada um: slug curto, número de sessões, cwd e idade da última atividade.
```

```
/projects

No projeto atual, quais sessões estão ativas agora?
Minha sessão é <sessionId-curto>.
```

### Via backend HTTP

```bash
curl -X POST http://localhost:3457/api/skills/run \
  -H "Authorization: Bearer $API_BEARER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "skillName": "projects",
    "prompt": "Liste todos os projects do Claude Code com sessões + última atividade.",
    "maxTurns": 5,
    "allowedTools": ["Bash"],
    "timeoutMs": 90000
  }'
```

## Promoção a skill global (futuro)

Esta skill é **completamente portável** — funciona em qualquer máquina, qualquer projeto Claude Code, sem ajuste. Se útil em outros projetos, mover pra `~/.claude/skills/projects/SKILL.md` (escopo global) **sem mudar uma linha**.
