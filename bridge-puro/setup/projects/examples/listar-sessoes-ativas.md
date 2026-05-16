# Exemplo: listar sessões ativas

## Prompt

```
/projects

Liste todas as sessões ativas no projeto openclaw-mythos-puro
nos últimos 60 minutos. Pra cada uma, diga:
- sessionId (curto, primeiros 8 chars)
- cwd
- slug (se houver)
- última atividade (relativa, ex: "há 3 min")
- última ação registrada (descrição do último tool_use ou prompt do usuário)
```

## Comandos esperados que o Claude rode

```bash
# 1. Localizar slug do projeto atual
PROJECT_SLUG="-Users-2a--claude-openclaw-mythos-puro"
PROJECTS_DIR="$HOME/.claude/projects/$PROJECT_SLUG"

# 2. Listar jsonls modificados na última hora, ordenados por mtime
find "$PROJECTS_DIR" -name '*.jsonl' -mmin -60 -exec ls -lt {} +

# 3. Pra cada arquivo, pegar último evento
for f in $(find "$PROJECTS_DIR" -name '*.jsonl' -mmin -60); do
  echo "=== $(basename $f .jsonl | cut -c1-8) ==="
  tail -c 4000 "$f" | tail -1 | jq -r '
    "cwd: \(.cwd // "?")",
    "slug: \(.slug // "?")",
    "ts:  \(.timestamp // "?")",
    "type: \(.type // "?")"
  '
done
```

## Resposta esperada

```
2 sessões ativas nos últimos 60 min:

1. 78a3b879 — backend/ (slug: parallel-tickling-quasar)
   Última atividade: há 4 min
   Última ação: validar que run-skill.js carrega e descobre gerar-slides

2. 112eaf56 — openclaw-mythos-puro/
   Última atividade: agora
   Última ação: criar bridge/projects/README.md
```

## Notas

- Use `find -mmin -60` em vez de `ls -lt` quando quiser garantir filtro temporal preciso.
- Para projetos com >20 sessões históricas, sempre filtrar por `mmin` antes de iterar.
