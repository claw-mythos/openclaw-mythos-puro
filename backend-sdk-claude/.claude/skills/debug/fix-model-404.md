---
name: fix-model-404
description: Corrige erro 404 de modelo no task-runner. Verifica se o model ID esta valido na API.
---

# Fix Model 404

## Passos

1. **Ver modelo configurado**
   ```bash
   grep "MYTHOS_MODEL\|claude-opus\|claude-sonnet" /Users/2a/.claude/batalha/openclaw-mythos/backend/services/task-runner.js
   grep "MYTHOS_MODEL" /Users/2a/.claude/batalha/openclaw-mythos/backend/.env
   ```

2. **Testar se modelo funciona**
   ```bash
   curl -s -X POST https://api.anthropic.com/v1/messages \
     -H "x-api-key: $ANTHROPIC_API_KEY" \
     -H "content-type: application/json" \
     -H "anthropic-version: 2023-06-01" \
     -d '{"model":"claude-opus-4-6","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}' | python3 -m json.tool
   ```

3. **Corrigir** — editar task-runner.js ou .env com modelo valido

## Modelos validos
- claude-opus-4-6
- claude-sonnet-4-6
- claude-haiku-4-5-20251001
