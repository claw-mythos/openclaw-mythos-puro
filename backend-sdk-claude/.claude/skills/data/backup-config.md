---
name: backup-config
description: Backup das configuracoes do backend (.env) e estado atual do projeto.
---

# Backup Config

## Passos

1. **Backup do .env**
   ```bash
   cp backend/.env /tmp/chat-backend-env.bak
   echo "Backend .env salvo em /tmp/chat-backend-env.bak"
   ```

2. **Backup do package.json** (versoes das dependencias)
   ```bash
   cp backend/package.json /tmp/chat-backend-package.bak
   echo "package.json salvos"
   ```

3. **Snapshot das configuracoes atuais**
   ```bash
   echo "=== SDK ===" > /tmp/chat-config-snapshot.txt
   cd backend && node -e "console.log('SDK:', require('@anthropic-ai/claude-code/package.json').version)" >> /tmp/chat-config-snapshot.txt
   echo "=== Backend .env ===" >> /tmp/chat-config-snapshot.txt
   cat backend/.env >> /tmp/chat-config-snapshot.txt
   echo "=== Model default ===" >> /tmp/chat-config-snapshot.txt
   echo "=== Node ===" >> /tmp/chat-config-snapshot.txt
   node --version >> /tmp/chat-config-snapshot.txt
   cat /tmp/chat-config-snapshot.txt
   ```

## Nota
- Sessoes ficam em memoria — exportar com /export-sessions antes de reiniciar
