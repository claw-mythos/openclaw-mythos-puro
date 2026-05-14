---
name: check-sdk
description: Verifica versao do SDK JS usado neste projeto. IMPORTANTE — a v1.0.128 e a ultima compativel, NAO atualizar.
---

# Verificar SDK

## AVISO CRITICO — NAO ATUALIZAR

Este projeto usa `@anthropic-ai/claude-code` v1.0.128 como **SDK JS** (importa `query()` via require).
A partir da v2.0 esse pacote virou **apenas CLI** — removeram o SDK JS importavel.
Atualizar para v2.x **QUEBRA o projeto** (o require falha, o `query()` nao existe mais).

| Versao | O que e | Funciona aqui? |
|--------|---------|----------------|
| 1.0.128 | SDK JS com `query()` exportado | **SIM — usar esta** |
| 2.x+ | Apenas CLI (binario `claude`) | **NAO — quebra o require()** |

A v1.0.128 e a **ultima e final** versao compativel. Nao existe versao mais nova do SDK JS.

## Passos de verificacao

1. **Versao instalada** (deve ser 1.0.128):
   ```bash
   cd backend-sdk-claude && node -e "console.log(require('@anthropic-ai/claude-code/package.json').version)"
   ```

2. **Import funciona?**
   ```bash
   cd backend-sdk-claude && node -e "const { query } = require('@anthropic-ai/claude-code'); console.log('OK:', typeof query)"
   ```

3. **Teste rapido**:
   ```bash
   cd backend-sdk-claude && node -e "
   const { query } = require('@anthropic-ai/claude-code');
   (async () => {
     for await (const msg of query({ prompt: 'oi', options: { maxTurns: 1, permissionMode: 'bypassPermissions' } })) {
       if (msg.type === 'result') console.log(msg.is_error ? 'ERRO' : 'OK');
     }
   })();
   "
   ```

## Reportar
- Versao instalada (deve ser 1.0.128)
- Se import e query funcionam
- Se alguem perguntar sobre atualizar: **NAO PODE** — v2.x nao tem SDK JS
