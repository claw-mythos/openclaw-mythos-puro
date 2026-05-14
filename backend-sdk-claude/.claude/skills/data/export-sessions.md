---
name: export-sessions
description: Exporta conversas do chat para JSON ou markdown. Util para backup ou analise.
---

# Exportar Sessoes

## Passos

1. **Listar sessoes ativas**
   ```bash
   curl -s http://localhost:3456/api/sessions | python3 -c "
   import json,sys
   sessions = json.load(sys.stdin)
   for s in sessions:
     msgs = len(s.get('messages',[]))
     title = s.get('title','sem titulo')[:50]
     print(f'{s[\"id\"][:8]}... | {msgs} msgs | {title}')
   print(f'\nTotal: {len(sessions)} sessoes')
   " 2>/dev/null || echo "Backend nao responde"
   ```

2. **Exportar todas para JSON**
   ```bash
   curl -s http://localhost:3456/api/sessions | python3 -c "
   import json,sys
   sessions = json.load(sys.stdin)
   with open('/tmp/chat-sessions-export.json', 'w') as f:
     json.dump(sessions, f, indent=2, ensure_ascii=False)
   print(f'Exportado {len(sessions)} sessoes para /tmp/chat-sessions-export.json')
   "
   ```

3. **Exportar para Markdown** (mais legivel)
   ```bash
   curl -s http://localhost:3456/api/sessions | python3 -c "
   import json,sys
   sessions = json.load(sys.stdin)
   for s in sessions:
     fname = f'/tmp/chat-session-{s[\"id\"][:8]}.md'
     with open(fname, 'w') as f:
       f.write(f'# {s.get(\"title\",\"Sem titulo\")}\n\n')
       for m in s.get('messages',[]):
         role = 'Usuario' if m.get('type') == 'user' else 'Claude'
         f.write(f'**{role}**: {m.get(\"content\",\"\")}\n\n')
     print(f'  {fname}')
   print(f'Total: {len(sessions)} arquivos')
   "
   ```

