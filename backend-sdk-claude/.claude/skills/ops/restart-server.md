---
name: restart-server
description: Para o backend, reinicia e verifica que esta saudavel. Usa log file para capturar output.
---

# Reiniciar Backend

## Passos

1. **Matar processo atual**
   ```bash
   kill $(pgrep -f "node server.js") 2>/dev/null; sleep 1
   echo "Processo anterior finalizado"
   ```

2. **Verificar syntax do server.js**
   ```bash
   cd backend-sdk-claude && node -c server.js && echo "Syntax OK"
   ```
   Se falhar, NAO reiniciar — reportar o erro.

3. **Iniciar backend**
   ```bash
   cd backend-sdk-claude && node server.js > /tmp/chat-backend.log 2>&1 &
   echo "PID: $!"
   sleep 2
   ```

4. **Verificar se subiu**
   ```bash
   tail -5 /tmp/chat-backend.log
   curl -s http://localhost:3456/health | python3 -m json.tool
   ```

5. **Confirmar** que aparece "Enhanced Claude Code SDK Server running on port 3456"

## Se falhar
Mostrar os ultimos 20 linhas do log:
```bash
tail -20 /tmp/chat-backend.log
```
