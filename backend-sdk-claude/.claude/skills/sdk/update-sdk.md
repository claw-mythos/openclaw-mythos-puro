---
name: update-sdk
description: NAO USAR — o SDK JS esta travado na v1.0.128 (ultima compativel). v2.x quebra o projeto.
---

# Atualizar SDK — BLOQUEADO

## NAO ATUALIZAR

O pacote `@anthropic-ai/claude-code` NAO pode ser atualizado neste projeto.

**Motivo**: A partir da v2.0, o pacote mudou de proposito:
- v1.x = SDK JS com funcao `query()` exportada via CommonJS (o que este projeto usa)
- v2.x = Apenas CLI (binario `claude`), sem SDK JS, sem exports, sem `query()`

Atualizar para v2.x causa:
```
Error: Cannot find module '@anthropic-ai/claude-code'
```
O `require('@anthropic-ai/claude-code')` falha porque o pacote v2 nao tem entry point JS.

## Versao fixa
```json
"@anthropic-ai/claude-code": "1.0.128"
```
Esta e a ultima e definitiva versao. Manter no package.json.

## Se acidentalmente atualizou
Reverter imediatamente:
```bash
cd backend-sdk-claude && npm install @anthropic-ai/claude-code@1.0.128
```
Verificar:
```bash
node -e "const { query } = require('@anthropic-ai/claude-code'); console.log('OK:', typeof query)"
```

## Futuro — como desbloquear esta skill

Quando surgir uma alternativa viavel, edite este arquivo para transformar o bloqueio
em passos de migracao. O Claude do chat UI le este markdown a cada execucao — basta
trocar o conteudo e o comportamento muda imediatamente.

Cenarios possiveis:
1. **Novo pacote SDK JS** (ex: `@anthropic-ai/claude-code-sdk`) — atualizar o require e testar
2. **Migrar para ESM** — mudar server.js para `import`, adicionar `"type": "module"` no package.json
3. **Migrar para subprocess** — trocar `query()` por spawn do CLI `claude` com JSON stdio

Para desbloquear: remova a secao "NAO ATUALIZAR", mude a description no frontmatter,
e escreva os novos passos de migracao aqui. Nenhum codigo precisa mudar — so este .md.
