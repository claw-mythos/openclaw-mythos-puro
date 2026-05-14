---
name: check-logs
description: Mostra ultimos erros e warnings do backend do chat app. Util para diagnosticar falhas de conexao ou SDK.
---

# Verificar Logs do Backend

## Passos

1. **Verificar se o backend esta rodando**
   ```bash
   pgrep -f "node server.js" && echo "RODANDO" || echo "PARADO"
   ```

2. **Verificar log file** (se existe)
   ```bash
   tail -50 /tmp/chat-backend.log 2>/dev/null || echo "Sem log file — backend pode estar rodando no terminal"
   ```

3. **Filtrar apenas erros**
   ```bash
   grep -i "error\|❌\|fail\|ECONNREFUSED\|exit code" /tmp/chat-backend.log 2>/dev/null | tail -20
   ```

4. **Verificar health do backend**
   ```bash
   curl -s http://localhost:3456/health 2>/dev/null | python3 -m json.tool || echo "Backend nao responde em :3456"
   ```

5. **Verificar portas**
   ```bash
   lsof -i :3456 -P | head -5   # backend
   ```

## Reportar
- Backend rodando ou parado
- Ultimos erros (se houver)
- Status do health check
- Portas ativas
