---
name: projects-absorb
description: Fluxo guiado de absorção e cleanup de sessões antigas. Lista sessões do projeto atual, extrai conteúdo útil das que o usuário escolher, arquiva (mv reversível, nunca rm) preservando a sessão atual. Aceita parâmetros explícitos do caller — não auto-decide. Use quando o usuário pedir "absorve as sessões antigas", "limpa as sessões e me mostra o que tinha", "merge das outras sessões na minha". Diferente de `projects` (read-only): esta skill ESCREVE no filesystem (archive). Diferente de qualquer cleanup automático: SEMPRE espera confirmação explícita antes de arquivar.
---

# Skill: projects-absorb

Fluxo de **3 estágios** com gate de confirmação no caller:

```
1. INSPECT  →  lista + minera sessões alvo (read-only)
2. PROPOSE  →  apresenta resumo destilado + lista do que SERIA arquivado
3. ARCHIVE  →  só executa quando o caller passar archiveConfirmed: true
```

## Quando usar

- "Quero ver o que tinha nas outras sessões antes de fechar"
- "Mostra resumo das outras sessões e me deixa escolher o que arquivar"
- "Absorve contexto das sessões X e Y e arquiva elas"
- "Limpa o histórico mas preserva minha sessão atual"

**Não use** pra cleanup automático sem revisão humana — pra isso existe um cron com filtro `mtime`, não esta skill.

## Parâmetros esperados do caller (no prompt)

| Param | Obrigatório | Descrição |
|---|---|---|
| `currentSessionId` | ✅ | sessionId da sessão do caller — NUNCA será arquivada |
| `targetSessionIds` | ⚠️ depende | Lista explícita de IDs (curtos ou completos) a absorver/arquivar. Se omitido, skill **só lista** sem mexer em nada (modo descoberta). |
| `archiveConfirmed` | ⚠️ depende | `true` libera o `mv`. Sem isso, skill executa só INSPECT + PROPOSE e para. |
| `cwd` | ❌ | Path do projeto — default `pwd`. Útil se backend chamou skill com cwd diferente. |

## Estágio 1 — INSPECT (sempre rodar)

```bash
CWD="${CWD:-$(pwd)}"
SLUG=$(echo "$CWD" | sed 's|[/.]|-|g')
PROJECTS_DIR="$HOME/.claude/projects/$SLUG"
NOW=$(date +%s)

[ -d "$PROJECTS_DIR" ] || { echo "Sem projeto Claude Code para $CWD"; exit 0; }

echo "=== Sessões neste projeto ==="
find "$PROJECTS_DIR" -maxdepth 1 -name '*.jsonl' | while read f; do
  SID=$(basename "$f" .jsonl)
  SHORT=${SID:0:8}
  SIZE=$(ls -lh "$f" | awk '{print $5}')
  AGE_MIN=$(( (NOW - $(stat -f %m "$f")) / 60 ))
  CWD_INNER=$(jq -r 'select(.cwd) | .cwd' "$f" 2>/dev/null | head -1)
  SLUG_INNER=$(jq -r 'select(.slug) | .slug' "$f" 2>/dev/null | head -1)
  IS_CURRENT=""
  [[ "$SID" == "$CURRENT_SESSION_ID"* ]] && IS_CURRENT=" 👈 ATUAL (preservar)"
  IS_ACTIVE=""
  [ "$AGE_MIN" -lt 5 ] && IS_ACTIVE=" ⚠️  ATIVA <5min — outro terminal pode estar vivo"
  echo "$SHORT | $SIZE | ${AGE_MIN}min atrás | cwd=$CWD_INNER | slug=$SLUG_INNER$IS_CURRENT$IS_ACTIVE"
done
```

**Pra cada sessão em `targetSessionIds`** (se fornecido), também rode mineração detalhada:

```bash
JSONL="$PROJECTS_DIR/${TARGET_SID}.jsonl"

echo "─── ${TARGET_SID:0:8} ───"

# Prompts humanos (truncados em 200 chars)
echo "Prompts:"
jq -r 'select(.type=="user" and (.message.content | type=="string")) | "  [\(.timestamp[11:19])] \(.message.content[:200])"' "$JSONL" 2>/dev/null | tail -10

# Arquivos editados
echo "Editados:"
jq -r 'select(.message.content) | .message.content[]? | select(.type=="tool_use" and (.name=="Edit" or .name=="Write")) | .input.file_path // empty' "$JSONL" 2>/dev/null | sort -u | sed 's/^/  /'

# Comandos Bash
echo "Bash:"
jq -r 'select(.message.content) | .message.content[]? | select(.type=="tool_use" and .name=="Bash") | "  ▸ \(.input.description)"' "$JSONL" 2>/dev/null | tail -15

# Tools usadas (frequência)
echo "Tools:"
jq -r 'select(.message.content) | .message.content[]? | select(.type=="tool_use") | .name' "$JSONL" 2>/dev/null | sort | uniq -c | sort -rn | sed 's/^/  /'
```

## Estágio 2 — PROPOSE (interpretação)

Após coletar dados brutos, **destile em prosa curta** o que cada sessão fez:

- 1-2 frases resumindo o objetivo da sessão
- O que ela produziu de concreto (arquivos, decisões)
- Achados não-óbvios que valem absorver pro contexto do caller
- Estado atual (terminada / pausada / ativa)

E mostre o **plano de archive proposto**:

```
Plano de archive:
  - 4c00816e (269K, 5min atrás) → ARQUIVAR
  - 78a3b879 (234K, 30min atrás) → ARQUIVAR
  - 112eaf56 (839K, agora)       → PRESERVAR (sessão atual)

Para confirmar, chame novamente com archiveConfirmed: true.
```

**Pare aqui se `archiveConfirmed != true`.** Não faça nada destrutivo.

## Estágio 3 — ARCHIVE (apenas com confirmação)

```bash
ARCHIVE_DIR="$HOME/.claude/projects-archive/$SLUG"
LOG="$HOME/.claude/projects-archive/cleanup.log"
TS=$(date +%Y%m%d-%H%M%S)

mkdir -p "$ARCHIVE_DIR"

ARCHIVED=0
for SID in $TARGET_SESSION_IDS; do
  # Match prefix (8 chars) ou full
  for f in "$PROJECTS_DIR"/${SID}*.jsonl; do
    [ -e "$f" ] || continue
    FULL_SID=$(basename "$f" .jsonl)

    # Salvaguarda: nunca arquivar a atual mesmo se vier no target
    [[ "$FULL_SID" == "$CURRENT_SESSION_ID"* ]] && {
      echo "skip $FULL_SID (sessão atual — protegida)"
      continue
    }

    DEST="$ARCHIVE_DIR/${FULL_SID}.jsonl.${TS}"
    mv "$f" "$DEST"
    SIZE=$(ls -lh "$DEST" | awk '{print $5}')
    echo "archived ${FULL_SID:0:8} ($SIZE) → $DEST"
    echo "$(date -u +%FT%TZ) | archive | ${FULL_SID} | from=${f} | to=${DEST}" >> "$LOG"
    ARCHIVED=$((ARCHIVED + 1))
  done
done

echo
echo "=== Resumo ==="
echo "Arquivadas: $ARCHIVED"
echo "Destino:    $ARCHIVE_DIR"
echo "Log:        $LOG"
echo
echo "Reverter qualquer:"
echo "  mv $ARCHIVE_DIR/<sid>.jsonl.$TS $PROJECTS_DIR/<sid>.jsonl"
```

## Regras de segurança (não-negociáveis)

- **NUNCA `rm`.** Sempre `mv` pra archive. Reversível por design.
- **NUNCA toque `memory/`.** Glob estrito `*.jsonl` no nível superior do `<slug>/`.
- **NUNCA arquive `currentSessionId`.** Salvaguarda dupla: filtro no input + check no loop.
- **NUNCA arquive sem `archiveConfirmed: true`.** O default é dry-run/proposta.
- **Avise sobre sessões ativas (mtime <5min)**: terminal vivo cria nova sessão automaticamente quando perde o jsonl. Não impede arquivamento, mas o caller precisa saber.
- **Log append-only** em `~/.claude/projects-archive/cleanup.log` com timestamp UTC.

## Exemplo de invocações

### Modo descoberta (sem targets, sem confirm) — só INSPECT

```json
{
  "skillName": "projects-absorb",
  "prompt": "Liste sessões deste projeto. currentSessionId: 112eaf56",
  "allowedTools": ["Bash"]
}
```

Retorna lista das sessões, sem mexer em nada.

### Modo propose (com targets, sem confirm) — INSPECT + PROPOSE

```json
{
  "skillName": "projects-absorb",
  "prompt": "Mine as sessões 4c00816e e 78a3b879 e mostra o que tem nelas. currentSessionId: 112eaf56. targetSessionIds: 4c00816e, 78a3b879",
  "allowedTools": ["Bash"]
}
```

Retorna resumo destilado + plano de archive — não executa.

### Modo full (com confirm) — INSPECT + PROPOSE + ARCHIVE

```json
{
  "skillName": "projects-absorb",
  "prompt": "Absorva e arquive 4c00816e e 78a3b879. currentSessionId: 112eaf56. targetSessionIds: 4c00816e, 78a3b879. archiveConfirmed: true",
  "allowedTools": ["Bash"]
}
```

Executa todos os 3 estágios. Retorna resumo + confirmação do archive + paths de reversão.

## Fluxo típico do frontend (openclaw)

```
1. UI lista sessões
   POST /api/skills/run { skillName: "projects", prompt: "list" }
   ← lista de sessões

2. Usuário marca checkboxes → escolhe IDs
3. UI dispara mineração + propose
   POST /api/skills/run { skillName: "projects-absorb",
                         prompt: "...currentSessionId, targetSessionIds, sem confirm" }
   ← resumo do que seria arquivado

4. Usuário revisa, clica "confirmar"
5. UI dispara archive
   POST /api/skills/run { skillName: "projects-absorb",
                         prompt: "...currentSessionId, targetSessionIds, archiveConfirmed: true" }
   ← confirmação + paths
```

## O que NUNCA fazer

- ❌ Auto-decidir quais sessões arquivar — sempre exigir `targetSessionIds` explícitos.
- ❌ Pular o estágio PROPOSE — confirmação humana é obrigatória.
- ❌ Aceitar `archiveConfirmed: true` sem `targetSessionIds` (vazio = no-op, não erro silencioso destrutivo).
- ❌ Hardcodar paths da máquina do dev — sempre `$HOME` + `pwd | sed 's|[/.]|-|g'`.
- ❌ Apagar `memory/` ou qualquer subdiretório.
