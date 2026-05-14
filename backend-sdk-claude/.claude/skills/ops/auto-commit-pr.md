---
name: auto-commit-pr
description: Detecta mudanças em todos os repos relacionados ao openclaw, cria commits e PRs. Sabe diferenciar repos próprios (push direto) de forks/upstream (fork + PR).
---

# Auto Commit & PR — Multi-Repo

Verifica mudanças em todos os repos relacionados e cria commits/PRs conforme o caso.

## Repos monitorados

| Repo | Path | Owner | Estratégia |
|------|------|-------|-----------|
| openclaw-mythos | /Users/2a/.claude/batalha/openclaw-mythos | diegofornalha | push direto + PR |
| OPENCLAW_docs | /Users/2a/.claude/batalha/OPENCLAW_docs | diegofornalha | push direto + PR |
| openclaw | /Users/2a/.claude/batalha/openclaw | sipeed (upstream) | fork + PR upstream |
| whatsmeow | /Users/2a/.claude/whatsmeow | tulir (upstream) | somente pull, sem push |

## 1. Verificar mudanças em cada repo

```bash
for repo in /Users/2a/.claude/batalha/openclaw-mythos /Users/2a/.claude/batalha/OPENCLAW_docs /Users/2a/.claude/batalha/openclaw /Users/2a/.claude/whatsmeow; do
  echo "=== $(basename $repo) ==="
  cd "$repo" && git status --porcelain 2>/dev/null | head -10
  echo ""
done
```

Se nenhum repo tiver mudanças, reportar e parar.

## 2. Para cada repo COM mudanças

### Repos próprios (openclaw-mythos, OPENCLAW_docs)

```bash
cd <repo>
git diff --stat
BRANCH="mythos/auto-$(date +%Y%m%d-%H%M)"
git checkout -b "$BRANCH"
git add -A
git commit -m "<mensagem descritiva baseada no diff>

Aplicado pelo ciclo autônomo do openclaw-mythos
Co-Authored-By: openclaw-mythos <noreply@openclaw.io>"
git push -u origin "$BRANCH"
gh pr create --title "<titulo>" --body "## Mudanças
<lista>

Aplicado automaticamente pelo openclaw-mythos."
git checkout main
```

### Repo upstream (openclaw — sipeed/openclaw)

Antes de modificar, verificar se existe fork do usuário:
```bash
gh repo view diegofornalha/openclaw 2>/dev/null && echo "fork existe" || echo "precisa forkar"
```

Se não tiver fork: `gh repo fork sipeed/openclaw --clone=false`

Criar branch no fork:
```bash
cd /Users/2a/.claude/batalha/openclaw
git remote add myfork https://github.com/diegofornalha/openclaw.git 2>/dev/null
BRANCH="mythos/auto-$(date +%Y%m%d-%H%M)"
git checkout -b "$BRANCH"
git add -A
git commit -m "<mensagem>"
git push myfork "$BRANCH"
gh pr create --repo sipeed/openclaw --head "diegofornalha:$BRANCH" --title "<titulo>" --body "<corpo>"
git checkout main
```

### whatsmeow — SOMENTE LEITURA

NÃO commitar nem criar PR no whatsmeow. Se houver mudanças locais, reportar e sugerir que sejam descartadas ou movidas para o openclaw.

## 3. Reportar

Para cada repo processado:
- Branch criada
- URL do PR (se criado)
- Arquivos modificados
- Se whatsmeow tem mudanças locais pendentes
