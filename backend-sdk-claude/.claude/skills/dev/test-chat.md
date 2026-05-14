---
name: test-chat
description: Envia mensagem teste via SDK direto no terminal para verificar que o Claude Code SDK funciona. Nao precisa do browser.
---

# Testar Chat

Teste rapido do SDK sem precisar do browser.

## Passos

1. **Teste basico** (sem opcoes extras)
   ```bash
   cd backend && node -e "
   const { query } = require('@anthropic-ai/claude-code');
   (async () => {
     for await (const msg of query({ prompt: 'diga apenas oi', options: { maxTurns: 1 } })) {
       if (msg.type === 'result') console.log('Resultado:', msg.result, '| Erro:', msg.is_error);
     }
   })();
   "
   ```

2. **Teste com opcoes do server** (streaming + permissoes)
   ```bash
   cd backend && node -e "
   const { query } = require('@anthropic-ai/claude-code');
   (async () => {
     const types = [];
     for await (const msg of query({ 
       prompt: 'diga oi', 
       options: { maxTurns: 1, includePartialMessages: true, permissionMode: 'bypassPermissions', stderr: (d) => console.error('stderr:', d) } 
     })) {
       types.push(msg.type);
       if (msg.type === 'result') console.log('OK:', msg.result);
     }
     console.log('Tipos recebidos:', types.join(', '));
   })();
   "
   ```

3. **Teste com modelo especifico** (validar model ID)
   ```bash
   cd backend && node -e "
   const { query } = require('@anthropic-ai/claude-code');
   (async () => {
     try {
       for await (const msg of query({ 
         prompt: 'diga oi', 
         options: { maxTurns: 1, model: 'claude-opus-4-6', permissionMode: 'bypassPermissions' } 
       })) {
         if (msg.type === 'result') console.log('Model OK:', msg.result, '| Erro:', msg.is_error);
       }
     } catch(e) { console.error('Model FALHOU:', e.message); }
   })();
   "
   ```

## Resultado esperado
- Teste 1: resposta simples sem erro
- Teste 2: tipos incluem stream_event + result
- Teste 3: modelo responde sem 404
