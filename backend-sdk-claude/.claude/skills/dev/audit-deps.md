---
name: audit-deps
---

# Auditar Dependencias

## Passos

1. **Backend**
   ```bash
   cd backend-sdk-claude && echo "=== BACKEND ===" && npm audit 2>&1 | tail -15 && echo "" && npm outdated 2>/dev/null
   ```

2. **Frontend**
   ```bash
   ```

3. **Fix automatico** (se usuario autorizar)
   ```bash
   cd backend-sdk-claude && npm audit fix
   ```

## Reportar
- Total de vulnerabilidades (critical/high/moderate/low) por pasta
- Pacotes desatualizados
- Se npm audit fix resolve ou precisa de --force
