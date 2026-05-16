---
description: ⚠️ DESTRUTIVO. REMOVE (rm definitivo, irreversível) TODAS as sessões de TODOS os projetos em ~/.claude/projects/, preservando apenas a sessão atual deste terminal. Use só quando quer zerar de verdade — não há recuperação.
allowed-tools: Bash
---

# /projects-absorb-auto-all

**⚠️ Modo destrutivo global.** Varre todos os slugs em `~/.claude/projects/`, **deleta** todos os `.jsonl` com `rm`, preserva só a sessão atual. **Não há undo.**

## Argumento obrigatório

Pegue o `currentSessionId` da invocação. Se o usuário não passou, **não invente** — peça uma vez de forma curta e pare:

> Qual sessionId desta sessão? (8 chars bastam, encontre no nome do `.jsonl` em `~/.claude/projects/<slug>/`)

Quando tiver, execute o bloco abaixo SEM mais interação:

```bash
PROJECTS_ROOT="$HOME/.claude/projects"
LOG_DIR="$HOME/.claude/projects-archive"
LOG="$LOG_DIR/cleanup.log"
TS=$(date +%Y%m%d-%H%M%S)
CURRENT_SLUG=$(pwd | sed 's|[/.]|-|g')
CURRENT_SESSION="<currentSessionId-fornecido-pelo-usuario>"

# Salvaguarda contra CURRENT_SESSION vazio (glob ""* casa qualquer SID)
if [ -z "$CURRENT_SESSION" ]; then
  echo "ERRO: CURRENT_SESSION vazio — abortando pra não preservar tudo do slug atual por engano."
  exit 1
fi

[ -d "$PROJECTS_ROOT" ] || { echo "Sem ~/.claude/projects"; exit 0; }

mkdir -p "$LOG_DIR"

TOTAL_DELETED=0
TOTAL_SKIPPED=0
TOTAL_SLUGS=0

for slug_dir in "$PROJECTS_ROOT"/*/; do
  [ -d "$slug_dir" ] || continue
  SLUG=$(basename "$slug_dir")
  TOTAL_SLUGS=$((TOTAL_SLUGS+1))

  shopt -s nullglob
  files=( "$slug_dir"*.jsonl )
  shopt -u nullglob
  [ ${#files[@]} -gt 0 ] || continue

  echo "── $SLUG"
  for f in "${files[@]}"; do
    SID=$(basename "$f" .jsonl)

    # Salvaguarda: preserva a sessão atual SOMENTE no slug atual
    if [[ "$SLUG" == "$CURRENT_SLUG" && "$SID" == "$CURRENT_SESSION"* ]]; then
      echo "  ✓ preservada: ${SID:0:8} (sessão atual)"
      TOTAL_SKIPPED=$((TOTAL_SKIPPED+1))
      continue
    fi

    SIZE=$(ls -lh "$f" | awk '{print $5}')
    rm "$f"
    echo "  ✗ deletada:  ${SID:0:8} ($SIZE)"
    echo "$(date -u +%FT%TZ) | delete-all | ${SID} | path=${f} | size=${SIZE}" >> "$LOG"
    TOTAL_DELETED=$((TOTAL_DELETED+1))
  done
done

echo
echo "=== Resumo global (rm) ==="
echo "Slugs varridos: $TOTAL_SLUGS"
echo "Deletadas:      $TOTAL_DELETED  (IRREVERSÍVEL)"
echo "Preservadas:    $TOTAL_SKIPPED  (só sessão atual de $CURRENT_SLUG)"
echo "Log:            $LOG"
```

Reporte o resumo em **uma linha por sessão deletada**, agrupado por slug, + 1 bloco final. Não filosofe, não explique fluxo, não ofereça próximo passo.

## Regras de segurança

- **rm é IRREVERSÍVEL** — não há undo. Use `/projects-absorb-auto` se quiser archive reversível.
- **NUNCA toque `memory/`** — glob `*.jsonl` no nível superior de cada `<slug>/`, não recursivo.
- **NUNCA delete a sessão atual** — comparada por slug+sid (slug atual derivado de `pwd`).
- **Aborta se `CURRENT_SESSION` vier vazio** — sem isso, o glob `""*` casaria qualquer SID e preservaria todo o slug atual por engano.
- **NUNCA processe slugs fora de `~/.claude/projects/`** — glob fixo no `PROJECTS_ROOT`.

## Aviso importante — escopo global e irreversibilidade

Este comando **deleta** sessões de **TODOS os projetos** Claude Code do usuário, não só o atual. Implicações:

- **Sem recuperação.** Diferente de `/projects-absorb-auto-all` versões anteriores (que faziam `mv` pra archive), este faz `rm` direto. O `cleanup.log` registra o que foi deletado mas não preserva o conteúdo.
- Sessões abertas em outros terminais Claude Code **ressuscitam como sessão nova** quando o terminal salvar próximo evento (o `.jsonl` original já não existe). Você perde a continuidade visual e o histórico não é recuperável.
- Confirme que todos os outros terminais Claude Code estão **fechados** antes de rodar.

## Quando NÃO usar

Use `/projects-absorb-auto` (mv reversível, só projeto atual) se:
- Quer poder reverter depois
- Só quer limpar o projeto atual

Use ESTE comando (`/projects-absorb-auto-all`) se:
- Quer zerar o histórico de TODOS os projetos de uma vez
- Tem certeza absoluta — sem recuperação possível
- Confirmou que outros terminais Claude Code estão fechados
