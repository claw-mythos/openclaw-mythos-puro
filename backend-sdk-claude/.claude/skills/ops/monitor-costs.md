---
name: monitor-costs
description: Verifica custo acumulado das chamadas ao Claude na sessao atual do backend.
---

# Monitorar Custos

## Passos

1. **Buscar sessoes com metadados de custo**
   ```bash
   curl -s http://localhost:3456/api/sessions | python3 -c "
   import json,sys
   sessions = json.load(sys.stdin)
   total = 0
   for s in sessions:
     session_cost = 0
     for m in s.get('messages',[]):
       if m.get('cost'):
         session_cost += m['cost']
     if session_cost > 0:
       print(f'  {s[\"id\"][:8]}... \${session_cost:.4f}')
     total += session_cost
   print(f'\nTotal acumulado: \${total:.4f}')
   " 2>/dev/null || echo "Backend nao responde"
   ```

2. **Verificar metricas de health**
   ```bash
   curl -s http://localhost:3456/health | python3 -m json.tool
   ```

## Nota
Os custos sao estimativas retornadas pelo SDK (campo total_cost_usd do result).
Sessoes em memoria sao perdidas ao reiniciar o backend.
