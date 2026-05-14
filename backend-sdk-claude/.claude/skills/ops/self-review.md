---
name: self-review
description: Revisão autônoma completa do openclaw-mythos. Analisa saúde, código, tasks recentes, e gera relatório com melhorias priorizadas.
---

# Self-Review do openclaw-mythos

Revisão autônoma do próprio sistema. Executa sem intervenção humana.

## 1. Saúde do servidor

```bash
curl -s http://localhost:3456/api/health | python3 -m json.tool
```

Verificar: status, uptime, checks com warning ou unhealthy.

## 2. Tasks recentes

```bash
curl -s "http://localhost:3456/api/tasks?limit=20" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for t in d['tasks']:
    print(t['status'], t['source'], t['prompt'][:60], t.get('error',''))
"
```

Identificar tasks com erro, padrões de falha, tasks lentas.

## 3. Revisar server.js

Ler `/Users/2a/.claude/batalha/openclaw-mythos/backend/server.js` e verificar:
- Handlers sem try/catch
- Memory leaks (Maps que crescem sem limite)
- Rotas duplicadas ou mortas
- Logs excessivos ou faltando

## 4. Revisar task-runner.js

Ler `/Users/2a/.claude/batalha/openclaw-mythos/backend/services/task-runner.js` e verificar:
- Worker processa fila corretamente
- Abort funciona sem deixar tasks presas
- Persistência de tasks funciona
- Missions autônomas fazem sentido

## 5. Verificar dependências

```bash
cd /Users/2a/.claude/batalha/openclaw-mythos/backend && npm outdated 2>/dev/null || true
```

## 6. Checar uso de disco

```bash
du -sh /Users/2a/.claude/batalha/openclaw-mythos/backend/data/ 2>/dev/null
du -sh /Users/2a/.claude/batalha/openclaw-mythos/backend/uploads/ 2>/dev/null
ls -la /Users/2a/.claude/batalha/openclaw-mythos/backend/data/ 2>/dev/null
```

## 7. Relatório final

Produzir relatório estruturado com:
- ✅ O que está funcionando bem
- ⚠️ Problemas encontrados (com severidade: baixa/média/alta)
- 🔧 Melhorias sugeridas (priorizadas)
- 📋 Próximas ações recomendadas
