# Exemplo: resumir uma sessão específica

## Prompt

```
/projects

Resume os últimos 15 minutos da sessão 78a3b879 do projeto atual.
Foque em:
- O que o usuário pediu (prompts humanos, não tool_results)
- Que arquivos foram editados
- Decisões tomadas
- Status atual (terminado / em progresso / bloqueado)
```

## Comandos esperados

```bash
SLUG="-Users-2a--claude-openclaw-mythos-puro"
SESSION="78a3b879-5ada-4147-bd7d-6ab31afc08c9"
JSONL="$HOME/.claude/projects/$SLUG/$SESSION.jsonl"

# Tamanho e janela temporal
ls -lh "$JSONL"

# Prompts humanos (excluir tool_results)
jq -c 'select(.type == "user" and (.message.content | type == "string"))' "$JSONL" | tail -10

# Arquivos editados
grep -oE '"file_path":"[^"]*"' "$JSONL" | sort -u

# Descrições de ações (tool_use de Bash)
grep -oE '"description":"[^"]*"' "$JSONL" | tail -20

# Status final: último evento
tail -1 "$JSONL" | jq '{type, timestamp, stop_reason: .message.stop_reason}'
```

## Filtros úteis com jq

```bash
# Só mensagens do usuário (texto puro, sem attachments)
jq -c 'select(.type=="user" and (.message.role=="user") and (.message.content | type=="string"))' "$JSONL"

# Só edits (Edit/Write tool_uses)
jq -c 'select(.message.content[]?.type == "tool_use" and (.message.content[]?.name | IN("Edit","Write")))' "$JSONL"

# Custos por mensagem (se presente)
jq -c 'select(.message.usage) | {ts: .timestamp, cache_read: .message.usage.cache_read_input_tokens, output: .message.usage.output_tokens}' "$JSONL"
```

## Resposta esperada

```
Sessão 78a3b879 (slug parallel-tickling-quasar, cwd backend/):

Pediu:
1. Implementar plano "auto-discovery de skills locais"
2. Validar que módulo carrega e descobre gerar-slides

Arquivos tocados:
- backend/services/skills/run-skill.js (refactor SKILLS_ALLOWED → BUILTIN + loadLocalSkills)
- bridge/gamma/README.md (remover passo manual)

Status: em verificação (último evento: tool_use de validação, há ~4 min). Não há erro registrado.
```
