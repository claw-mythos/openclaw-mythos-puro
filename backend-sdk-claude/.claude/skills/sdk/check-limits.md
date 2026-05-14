---
name: check-limits
description: Verifica se o Claude esta batendo rate limit ou usage limit. Analisa erros recentes no log.
---

# Verificar Limites

## Passos

1. **Buscar erros de limite nos logs**
   ```bash
   grep -i "limit\|rate\|429\|usage" /tmp/chat-backend.log 2>/dev/null | tail -10
   ```

2. **Verificar no Claude Code CLI**
   ```bash
   claude --usage 2>/dev/null || echo "Comando --usage nao disponivel nesta versao"
   ```

3. **Verificar erros recentes de API**
   ```bash
   grep -i "API Error\|404\|429\|500\|503" /tmp/chat-backend.log 2>/dev/null | tail -10
   ```

4. **Teste rapido de disponibilidade**
   ```bash
   cd backend-sdk-claude && node -e "
   const { query } = require('@anthropic-ai/claude-code');
   const start = Date.now();
   (async () => {
     try {
       for await (const msg of query({ prompt: 'oi', options: { maxTurns: 1, permissionMode: 'bypassPermissions' } })) {
         if (msg.type === 'result') {
           if (msg.is_error) console.log('LIMITE:', msg.result);
           else console.log('OK em', Date.now()-start, 'ms');
         }
       }
     } catch(e) { console.error('ERRO:', e.message); }
   })();
   "
   ```

## Sinais de limite
- Erro com "usage limit reached" — limite de uso atingido
- Erro 429 — rate limit (muitas requests por minuto)
- Erro com timestamp — extrair data de reset
- Respostas muito lentas (>30s) — possivel throttling
