---
name: self-improve
description: Aplica melhorias concretas no openclaw-mythos baseado nos achados do self-review. Lê, edita, testa.
---

# Self-Improve do openclaw-mythos

Melhoria autônoma do próprio sistema. Só executa após self-review identificar problemas.

## Regras

- Nunca reiniciar o servidor sem avisar
- Preferir mudanças pequenas e seguras
- Sempre testar após editar
- Documentar o que foi mudado

## Processo

### 1. Ler achados recentes do self-review

```bash
curl -s "http://localhost:3456/api/tasks?source=cron&status=done&limit=5"
```

### 2. Para cada melhoria identificada

Prioridade: alta → média → baixa

**Verificar se a mudança é segura:**
- Não quebra API pública (eventos WebSocket, endpoints REST)
- Não apaga dados
- Reversível

**Aplicar mudança no arquivo correto**

**Testar:**
```bash
# Syntax check
node --check /Users/2a/.claude/batalha/openclaw-mythos/backend/server.js && echo "OK"

# Health após mudança (se servidor rodando)
curl -s http://localhost:3456/api/health | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])"
```

### 3. Registrar mudanças

Criar arquivo `/Users/2a/.claude/batalha/openclaw-mythos/backend/data/changelog.md` com:
```
## YYYY-MM-DD HH:MM
- [arquivo] descrição da mudança
- motivo: ...
```
