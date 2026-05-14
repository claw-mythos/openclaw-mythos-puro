---
name: update-whatsmeow
description: Atualiza whatsmeow via git pull antes de qualquer melhoria relacionada ao WhatsApp. Verifica novidades e reporta mudanças relevantes.
---

# Atualizar whatsmeow antes de melhorar

**Regra**: sempre executar antes de modificar qualquer código relacionado ao WhatsApp no openclaw.

## 1. Git pull no whatsmeow

```bash
cd /Users/2a/.claude/whatsmeow && git pull 2>&1
```

## 2. Ver o que mudou

```bash
cd /Users/2a/.claude/whatsmeow && git log --oneline -20
```

```bash
# Mudanças nos últimos 30 dias
cd /Users/2a/.claude/whatsmeow && git log --oneline --since="30 days ago"
```

## 3. Verificar mudanças em arquivos críticos

```bash
cd /Users/2a/.claude/whatsmeow && git diff HEAD~5 -- "*.go" | head -200
```

## 4. Verificar se openclaw usa whatsmeow como dependência

```bash
grep -r "whatsmeow\|whatsapp" /Users/2a/.claude/batalha/openclaw-mythos/go.mod 2>/dev/null || \
grep -r "whatsmeow" /Users/2a/.claude/batalha/openclaw-mythos/backend/ 2>/dev/null | head -10
```

## 5. Relatório

Produzir resumo com:
- Novas funcionalidades ou APIs adicionadas
- Breaking changes que podem afetar o openclaw
- Bugs corrigidos relevantes
- Recomendação: atualizar dependência ou não
