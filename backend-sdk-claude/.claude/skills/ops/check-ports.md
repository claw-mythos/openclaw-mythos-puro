---
name: check-ports
description: Diagnostica conflitos de porta 3456 (backend). Mostra o que esta ocupando a porta.
---

# Verificar Portas

## Passos

1. **Porta 3456 (backend)**
   ```bash
   lsof -i :3456 -P | head -5
   ```

2. **Porta 18790 (openclaw gateway)**
   ```bash
   lsof -i :18790 -P | head -5
   ```

## Resolver conflitos
- Backend: `lsof -ti :3456 | xargs kill -9`
- Gateway: `launchctl unload ~/Library/LaunchAgents/io.openclaw.gateway.plist`
