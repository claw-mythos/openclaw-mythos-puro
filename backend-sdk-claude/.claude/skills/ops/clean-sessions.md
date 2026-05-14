---
name: clean-sessions
description: Limpa sessoes antigas da memoria do backend. As sessoes ficam em Map() e acumulam sem limite.
---

# Limpar Sessoes

O backend guarda sessoes em memoria (Map). Com uso continuo, isso acumula e consome RAM.

## Passos

1. **Verificar quantas sessoes existem**
   ```bash
   curl -s http://localhost:3456/api/sessions | python3 -c "
   import json,sys
   sessions = json.load(sys.stdin)
   print(f'Total: {len(sessions)} sessoes')
   for s in sessions:
     age_min = ($(date +%s)*1000 - s.get('lastActivity',0)) / 60000
     msgs = len(s.get('messages',[]))
     print(f'  {s[\"id\"][:8]}... | {msgs} msgs | {age_min:.0f}min atras')
   " 2>/dev/null || echo "Backend nao responde — verificar se esta rodando"
   ```

2. **Verificar contextos do SessionContextManager**
   ```bash
   curl -s http://localhost:3456/health | python3 -c "
   import json,sys
   d = json.load(sys.stdin)
   print(json.dumps(d, indent=2))
   " 2>/dev/null
   ```

3. **Para limpar**: a forma mais simples e reiniciar o backend (perde todas as sessoes em memoria)
   - Se quiser preservar sessoes ativas, considerar implementar endpoint DELETE /api/sessions/:id

## Nota
O SessionContextManager ja limpa contextos com mais de 2h automaticamente (cleanOldContexts).
Sessoes no Map principal nao tem limpeza automatica — acumulam ate o restart.
