---
description: Arquiva TODAS as outras sessões do projeto atual (mv reversível para ~/.claude/projects-archive/), preservando apenas a sessão atual. 100% automatizado — sem perguntas, sem mineração de contexto, sem confirmação. Ideal pra cleanup rápido quando você já sabe o que está fazendo.
allowed-tools: Bash
---

# /projects-absorb-auto

**Modo automatizado.** Sem perguntas, sem resumos. Lista, arquiva, reporta. Em 1 turno.

## Argumento obrigatório

Pegue o `currentSessionId` da invocação. Se o usuário não passou, **não invente** — peça uma vez de forma curta e pare:

> Qual sessionId desta sessão? (8 chars bastam, encontre no nome do `.jsonl` em `~/.claude/projects/<slug>/`)

Quando tiver, execute o bloco abaixo SEM mais interação:

```bash
SLUG=$(pwd | sed 's|[/.]|-|g')
PROJECTS_DIR="$HOME/.claude/projects/$SLUG"
ARCHIVE_DIR="$HOME/.claude/projects-archive/$SLUG"
LOG="$HOME/.claude/projects-archive/cleanup.log"
TS=$(date +%Y%m%d-%H%M%S)
CURRENT_SESSION="<currentSessionId-fornecido-pelo-usuario>"

[ -d "$PROJECTS_DIR" ] || { echo "Sem projeto Claude Code para $(pwd)"; exit 0; }

mkdir -p "$ARCHIVE_DIR"

ARCHIVED=0
SKIPPED=0
for f in "$PROJECTS_DIR"/*.jsonl; do
  [ -e "$f" ] || continue
  SID=$(basename "$f" .jsonl)

  # Salvaguarda dupla: nunca arquivar a sessão atual
  if [[ "$SID" == "$CURRENT_SESSION"* ]]; then
    echo "✓ preservada: ${SID:0:8} (sessão atual)"
    SKIPPED=$((SKIPPED+1))
    continue
  fi

  DEST="$ARCHIVE_DIR/${SID}.jsonl.${TS}"
  SIZE=$(ls -lh "$f" | awk '{print $5}')
  mv "$f" "$DEST"
  echo "→ arquivada:  ${SID:0:8} ($SIZE)"
  echo "$(date -u +%FT%TZ) | archive | ${SID} | from=${f} | to=${DEST}" >> "$LOG"
  ARCHIVED=$((ARCHIVED+1))
done

echo
echo "=== Resumo ==="
echo "Arquivadas:  $ARCHIVED"
echo "Preservadas: $SKIPPED"
echo "Destino:     $ARCHIVE_DIR"
echo "Log:         $LOG"
echo
echo "Reverter qualquer:"
echo "  mv $ARCHIVE_DIR/<sid>.jsonl.$TS $PROJECTS_DIR/<sid>.jsonl"
```

Reporte o resumo em **uma linha por sessão** + 1 bloco final. Não filosofe, não explique fluxo, não ofereça próximo passo. O usuário escolheu a versão auto justamente pra não ler verbose.

## Regras de segurança

- **NUNCA `rm`** — só `mv` pra archive (reversível).
- **NUNCA toque `memory/`** — glob `*.jsonl` no nível superior do `<slug>/`.
- **NUNCA arquive a sessão atual** — salvaguarda dupla com `[[ "$SID" == "$CURRENT_SESSION"* ]]`.
- **NUNCA processe slugs fora do projeto atual** — derive sempre de `pwd`.

## Quando NÃO usar este comando

Use `/projects-absorb-guided` se:
- Quer ver o que tinha nas sessões antes de arquivar
- Não tem certeza do `currentSessionId`
- Quer escolher quais arquivar (não todas)
- Está aprendendo o fluxo

Use ESTE comando (`/projects-absorb-auto`) se:
- Já fez o flow uma vez e sabe o que esperar
- Quer cleanup rápido entre tarefas
- Já confirmou que outros terminais estão fechados (senão eles ressuscitam como nova sessão)
