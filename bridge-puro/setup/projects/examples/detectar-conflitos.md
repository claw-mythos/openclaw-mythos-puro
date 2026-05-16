# Exemplo: detectar conflitos entre sessões

## Prompt

```
/projects

Estou prestes a editar backend/services/skills/run-skill.js.
Verifica se algum outro terminal está mexendo nesse arquivo
nos últimos 10 minutos. Se sim, me diga qual sessionId,
o que está fazendo, e quando foi a última edição.

Minha sessão atual: 112eaf56
```

## Comandos esperados

```bash
SLUG="-Users-2a--claude-openclaw-mythos-puro"
PROJECTS_DIR="$HOME/.claude/projects/$SLUG"
TARGET_FILE="run-skill.js"
CURRENT_SESSION="112eaf56"

# 1. Achar todos os jsonls com mtime recente
RECENT_FILES=$(find "$PROJECTS_DIR" -name '*.jsonl' -mmin -10)

# 2. Pra cada um, checar se tocou no arquivo alvo
for f in $RECENT_FILES; do
  SID=$(basename "$f" .jsonl)
  # Pular sessão atual
  [[ "$SID" == "$CURRENT_SESSION"* ]] && continue

  # Procurar referência ao arquivo
  HITS=$(grep -c "\"file_path\":\"[^\"]*$TARGET_FILE\"" "$f")
  if [ "$HITS" -gt 0 ]; then
    echo "=== $SID — $HITS edições em $TARGET_FILE ==="
    # Última ação registrada
    grep "\"file_path\":\"[^\"]*$TARGET_FILE\"" "$f" | tail -1 | jq -r '.timestamp'
    # cwd e slug
    head -1 "$f" | jq -r '"cwd: \(.cwd) | slug: \(.slug // "?")"'
  fi
done
```

## Resposta esperada (caso haja conflito)

```
⚠️ Conflito potencial em backend/services/skills/run-skill.js:

Sessão 78a3b879 (slug parallel-tickling-quasar, cwd backend/)
  • 3 edições neste arquivo nos últimos 10 min
  • Última edição: há 6 min (2026-05-13T12:50:14Z)
  • Status atual: em verificação (não está mais editando ativamente)

Recomendação: o outro terminal já terminou de editar.
Você pode prosseguir, mas faça `git diff` antes pra ver o que mudou.
```

## Resposta esperada (sem conflito)

```
✅ Nenhuma sessão ativa tocou em backend/services/skills/run-skill.js
nos últimos 10 minutos. Pode editar com segurança.
```

## Notas

- Filtro `-mmin -10` evita falso-positivo de sessões antigas que mencionam o arquivo.
- `grep -c` é barato — não precisa ler o jsonl inteiro com `jq`.
- Pular sessão atual via `CURRENT_SESSION` é essencial pra evitar avisar você sobre você mesmo.
- Pra workflow mais rigoroso, combine com `git status` no `cwd` da outra sessão.
