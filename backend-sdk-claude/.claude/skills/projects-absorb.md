---
name: projects-absorb
description: Preserva APENAS a sessão atual do projeto e DELETA (rm definitivo, irreversível) todas as outras sessões `.jsonl` em `~/.claude/projects/<slug>/`. Use SEMPRE que o usuário pedir "limpa as sessões antigas", "apaga tudo menos a atual", "preserva só a sessão atual", "zera o histórico do projeto", "limpa histórico Claude Code deste projeto". Diferente de listagem: esta skill APAGA do filesystem. Diferente de archive: usa `rm` definitivo — não há undo. SEMPRE espera confirmação explícita antes de apagar. Adaptada pra Linux (não macOS). Escopo: só o projeto atual (não global).
---

# Skill: projects-absorb (preservar sessão atual)

Fluxo de **2 estágios** com gate de confirmação:

```
1. INSPECT  →  lista sessões + mostra plano (atual preservada, outras apagadas)  [read-only]
2. PURGE    →  só executa quando o caller passar deleteConfirmed: true           [rm IRREVERSÍVEL]
```

## Quando usar

- "Apaga as sessões antigas e preserva só a atual"
- "Zera o histórico deste projeto, menos esta sessão"
- "Limpa as outras sessões deste projeto"
- "Quero terminal limpo, sem sessões antigas pendentes"

## Parâmetros esperados do caller (no prompt)

| Param | Obrigatório | Descrição |
|---|---|---|
| `currentSessionId` | ✅ **SEMPRE** | sessionId da sessão do caller — única que será preservada. Match por prefix 8+ chars. **SEM ISSO ABORTA** (segurança contra glob vazio). |
| `deleteConfirmed` | ⚠️ depende | `true` libera o `rm`. Sem isso, executa só INSPECT. |
| `cwd` | ❌ | Path do projeto — default `pwd`. Useful quando backend chamou skill com cwd diferente. |

**Não há `targetSessionIds`** — esta skill auto-seleciona "todas menos a atual". Se quiser escolha granular, use outra skill.

## Encoding `cwd → slug` (Linux + CLI Claude v2)

```
/home/lucrecia/openclaw-mythos-puro/backend-sdk-claude/grupos/faturas
→ -home-lucrecia-openclaw-mythos-puro-backend-sdk-claude-grupos-faturas
```

Apenas `/` vira `-`. `.` é preservado.

## Estágio 1 — INSPECT (sempre rodar)

```bash
set -euo pipefail

CWD="${CWD:-$(pwd)}"
CURRENT_SESSION_ID="${CURRENT_SESSION_ID:-}"

# ⚠️ Salvaguarda crítica: glob "${CURRENT_SESSION_ID}"* com ID vazio casa QUALQUER coisa
if [ -z "$CURRENT_SESSION_ID" ]; then
  echo "ERRO: currentSessionId obrigatório. Sem ele, a salvaguarda 'preservar atual' falha em silêncio."
  exit 1
fi

SLUG=$(echo "$CWD" | sed 's|/|-|g')
PROJECTS_DIR="$HOME/.claude/projects/$SLUG"
NOW=$(date +%s)

[ -d "$PROJECTS_DIR" ] || { echo "Sem projeto Claude Code para $CWD"; exit 0; }

echo "=== Plano de purge para $SLUG ==="
echo "currentSessionId: $CURRENT_SESSION_ID"
echo

TO_PRESERVE=0
TO_DELETE=0
for f in "$PROJECTS_DIR"/*.jsonl; do
  [ -e "$f" ] || continue
  SID=$(basename "$f" .jsonl)
  SHORT=${SID:0:8}
  SIZE=$(ls -lh "$f" | awk '{print $5}')
  AGE_MIN=$(( (NOW - $(stat -c %Y "$f")) / 60 ))

  if [[ "$SID" == "$CURRENT_SESSION_ID"* ]]; then
    echo "  ✓ PRESERVAR  $SHORT  ($SIZE, ${AGE_MIN}min atrás)  👈 sessão atual"
    TO_PRESERVE=$((TO_PRESERVE+1))
  else
    ACTIVE_WARN=""
    [ "$AGE_MIN" -lt 5 ] && ACTIVE_WARN="  ⚠️  ATIVA <5min — outro terminal pode estar vivo"
    echo "  ✗ APAGAR    $SHORT  ($SIZE, ${AGE_MIN}min atrás)$ACTIVE_WARN"
    TO_DELETE=$((TO_DELETE+1))
  fi
done

echo
echo "Total: $TO_PRESERVE preservada(s), $TO_DELETE pra apagar"
echo

if [ "${DELETE_CONFIRMED:-false}" != "true" ]; then
  echo "ℹ️  Modo dry-run (deleteConfirmed != true) — nada foi apagado."
  echo "   Pra executar, chame de novo com deleteConfirmed: true."
  exit 0
fi
```

## Estágio 2 — PURGE (apenas com confirmação)

```bash
LOG="$HOME/.claude/projects-archive/cleanup.log"
mkdir -p "$(dirname "$LOG")"

DELETED=0
for f in "$PROJECTS_DIR"/*.jsonl; do
  [ -e "$f" ] || continue
  SID=$(basename "$f" .jsonl)

  # Salvaguarda dupla: filtra de novo no momento do rm
  if [[ "$SID" == "$CURRENT_SESSION_ID"* ]]; then
    echo "  ✓ skip $SID (sessão atual)"
    continue
  fi

  SIZE=$(ls -lh "$f" | awk '{print $5}')
  rm "$f"
  echo "  ✗ rm   ${SID:0:8} ($SIZE)"
  echo "$(date -u +%FT%TZ) | rm | $SID | path=$f | size=$SIZE | slug=$SLUG" >> "$LOG"
  DELETED=$((DELETED+1))
done

echo
echo "=== Resumo (rm IRREVERSÍVEL) ==="
echo "Apagadas: $DELETED"
echo "Preservada(s) na pasta: $(ls "$PROJECTS_DIR"/*.jsonl 2>/dev/null | wc -l)"
echo "Log: $LOG"
```

## Regras de segurança (não-negociáveis)

- **`rm` é IRREVERSÍVEL.** Não há undo. Confirme que esta é a operação desejada antes.
- **ABORTA sem `currentSessionId`.** O glob `""*` casaria qualquer SID e nenhuma sessão seria deletada (ou pior: todas preservadas por engano). Esta é a defesa mais crítica.
- **NUNCA toque `memory/`.** Glob `*.jsonl` no nível superior; `memory/` é subdiretório.
- **NUNCA apague sem `deleteConfirmed: true`.** Default é dry-run.
- **NUNCA apague fora de `$PROJECTS_DIR` calculado.** Sem `..`, sem path absoluto vindo do user.
- **Escopo local apenas.** Esta skill só mexe no slug do `pwd` atual. Pra purgar TODOS os projetos, é outra skill.
- **Avise sobre sessões ATIVA <5min**: se mtime <5min, terminal vivo pode estar usando — apagar mata continuidade visual no outro terminal (e ele cria sessão nova no próximo evento).
- **Log append-only** em `~/.claude/projects-archive/cleanup.log` (a pasta `projects-archive/` mantém o nome legado, mas guarda só o log — nenhum `.jsonl` é movido).

## Exemplo de invocações no backend puro

A rota `/api/skills/run` foi removida no cleanup do puro — invocar via `POST /api/tasks` citando o nome da skill no prompt (`expandSkill` em `services/task-runner.js` resolve o `.md`):

### Modo dry-run (só INSPECT)

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "prompt":"/projects-absorb listar plano de purge. currentSessionId: 112eaf56",
    "workspace":"/home/lucrecia/openclaw-mythos-puro/backend-sdk-claude",
    "maxTurns":3
  }' \
  http://127.0.0.1:18888/api/tasks
```

Retorna lista de sessões com marcação PRESERVAR/APAGAR. Nada é deletado.

### Modo execute (PURGE)

```bash
curl ... -d '{
  "prompt":"/projects-absorb apagar outras sessões. currentSessionId: 112eaf56. deleteConfirmed: true",
  ...
}'
```

Apaga via `rm` tudo que não é `112eaf56*`. Resumo + log.

## Pegadinhas conhecidas

- **`stat -f %m` é macOS.** Esta skill usa `stat -c %Y` (Linux). Se rodar em mac, troca.
- **`sed 's|[/.]|-|g'` é divergente.** O CLI Claude v2 só substitui `/`. Não use `[/.]`.
- **`CURRENT_SESSION_ID` vazio = abort.** Não invente. Peça ao usuário se faltou.
- **Terminal vivo após `rm`**: o terminal Claude Code que estava usando aquele `.jsonl` cria um **novo** SID no próximo evento. Histórico visual do terminal não some, mas o disco perde o arquivo correspondente.
- **`memory/` subpasta**: nunca pega no glob `*.jsonl` (não tem extensão `.jsonl` no diretório `memory/`). Bom assim.

## O que NUNCA fazer

- ❌ Apagar sem `currentSessionId` (abort).
- ❌ Pular o estágio INSPECT — sempre mostrar plano antes.
- ❌ Aceitar `deleteConfirmed: true` se INSPECT mostrou 0 sessões pra apagar (no-op explícito).
- ❌ Apagar `memory/` ou qualquer subdiretório.
- ❌ Hardcodar paths — sempre `$HOME` + `pwd | sed 's|/|-|g'`.
- ❌ Versão recursiva sem confirm explícito.

## Skills relacionadas

- [[rodar-sessao-em-workspace]] — gera as sessões que esta skill apaga
- [[recriar-symlink-projects]] — garante o symlink local enxerga `~/.claude/projects/`
