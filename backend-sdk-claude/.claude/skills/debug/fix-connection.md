---
name: fix-connection
description: Diagnostica problemas de conexao do backend. Verifica se server.js esta rodando, health, e WebSocket.
---

# Fix Connection

## Passos

1. **Backend rodando?**
   ```bash
   curl -s http://localhost:3456/api/health | python3 -m json.tool
   ```

2. **Processo node ativo?**
   ```bash
   pgrep -f "node server.js" && echo "RODANDO" || echo "PARADO"
   ```

3. **Porta 3456 ocupada?**
   ```bash
   lsof -i :3456 -P | head -5
   ```

4. **Reiniciar se necessario**
   ```bash
   lsof -ti :3456 | xargs kill -9; sleep 1
   node server.js &
   ```

## Causas comuns
- Porta ocupada por processo antigo
- Crash sem reinicio (sem launchd ainda)
- Rate limit pausou o ciclo autonomo
