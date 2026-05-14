---
name: analyze-logs
description: Analisa os logs do openclaw em /Users/2a/.openclaw/logs/ para identificar padrões de erro, uso e oportunidades de melhoria.
---

# Análise de Logs do openclaw

## 1. Ler logs recentes

```bash
# Últimas 50 linhas de cada log
tail -50 /Users/2a/.openclaw/logs/audit.log
tail -50 /Users/2a/.openclaw/logs/status.log
tail -50 /Users/2a/.openclaw/logs/group-blocker.log
cat /Users/2a/.openclaw/logs/picowatch_stats.json
```

```bash
# Verificar se há panic logs
cat /Users/2a/.openclaw/logs/launcher_panic.log 2>/dev/null && echo "PANICS ENCONTRADOS" || echo "sem panics"
```

## 2. Identificar padrões problemáticos

No `audit.log`, procurar:
- `event=unknown` repetidos — qual ferramenta está gerando eventos desconhecidos?
- Erros ou falhas frequentes

No `group-blocker.log`, procurar:
- Grupos com muitas chamadas em sequência rápida (possível spam ou loop)
- Horários de pico

No `status.log`, procurar:
- Falhas em skills (status != OK)
- Eventos inesperados

## 3. Analisar métricas do picowatch_stats.json

- `skillsCreated` e `skillsPatched` — skills estão sendo criadas/melhoradas?
- `blockedAttempts` — há tentativas bloqueadas?
- `toolCalls` vs `totalConversations` — ratio de uso de ferramentas por conversa

## 4. Correlacionar com código

Se encontrar padrões problemáticos, procurar o código fonte responsável em:
- `/Users/2a/.claude/batalha/openclaw-mythos/` (Node.js backend)
- Skills em `/Users/2a/.openclaw/.claude/skills/`

## 5. Relatório

Produzir relatório com:
- 📊 Métricas de uso (conversas, tools, skills)
- 🔴 Erros/anomalias encontrados
- 🔧 Sugestões concretas de melhoria (com arquivo e linha se possível)
- 📈 Tendências observadas
