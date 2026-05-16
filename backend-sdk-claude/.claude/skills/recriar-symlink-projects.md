---
name: recriar-symlink-projects
description: Recria o symlink local `backend-sdk-claude/symlink/projects → /home/lucrecia/.claude/projects` (acesso aos transcripts de TODOS os projetos Claude Code do Lucas) e garante a entrada correspondente no `.gitignore` da raiz do repo `openclaw-mythos-puro`. Use SEMPRE que o usuário pedir "recria o symlink", "o symlink sumiu", "perdi a pasta projects", "rode a skill do projects", "refaz aquele link" ou similar — também é invocável proativamente quando você precisar usar `backend-sdk-claude/symlink/projects/` e descobrir que o link não existe/está quebrado.
---

# Recriar symlink `~/.claude/projects` dentro do backend

## O que essa skill faz

1. Garante a pasta `/home/lucrecia/openclaw-mythos-puro/backend-sdk-claude/symlink/` (cria se não existir).
2. Cria o symlink `/home/lucrecia/openclaw-mythos-puro/backend-sdk-claude/symlink/projects` apontando pra `/home/lucrecia/.claude/projects`.
3. Garante a entrada `backend-sdk-claude/symlink/projects` no `.gitignore` da raiz do repo (`/home/lucrecia/openclaw-mythos-puro/.gitignore`).
4. Valida com `ls` que o link funciona e mostra quantos projetos estão acessíveis.

Idempotente: se o link já existe e está correto, não faz nada destrutivo. Se está apontando pra outro destino, **NÃO** sobrescreve — alerta o usuário e pergunta antes de mexer.

## Por que existe

A pasta `symlink/projects/` dá acesso ao histórico de TODAS as sessões Claude Code do Lucas (inclusive de outros repos). Útil pra:
- Inspecionar transcripts/replays dentro do contexto do backend.
- Permitir que tasks deste backend leiam histórico de conversas anteriores.

**Conteúdo sensível** (pode ter tokens/secrets de qualquer projeto) → **NUNCA pode ir pro git**. A entry no `.gitignore` é parte essencial dessa skill.

## Passos

### 1. Verificar estado atual do symlink

```bash
TARGET=/home/lucrecia/.claude/projects
LINK=/home/lucrecia/openclaw-mythos-puro/backend-sdk-claude/symlink/projects
SYMLINK_DIR=/home/lucrecia/openclaw-mythos-puro/backend-sdk-claude/symlink

# Garante o diretório container
mkdir -p "$SYMLINK_DIR"

if [ -L "$LINK" ]; then
  CURRENT=$(readlink "$LINK")
  if [ "$CURRENT" = "$TARGET" ]; then
    echo "✅ Symlink já existe e está correto: $LINK -> $CURRENT"
  else
    echo "⚠️  Symlink existe mas aponta pra outro destino: $CURRENT"
    echo "   Não vou sobrescrever — peça confirmação ao usuário antes de remover."
    exit 1
  fi
elif [ -e "$LINK" ]; then
  echo "❌ $LINK existe como arquivo/pasta normal (não-symlink). Aborta — investiga manualmente."
  exit 1
else
  ln -s "$TARGET" "$LINK"
  echo "✅ Symlink criado: $LINK -> $TARGET"
fi
```

### 2. Garantir entrada no `.gitignore`

```bash
GITIGNORE=/home/lucrecia/openclaw-mythos-puro/.gitignore
ENTRY="backend-sdk-claude/symlink/projects"

if grep -qxF "$ENTRY" "$GITIGNORE"; then
  echo "✅ .gitignore já contém: $ENTRY"
else
  cat >> "$GITIGNORE" <<EOF

# Symlink local para ~/.claude/projects (transcripts de todos os projetos do
# Lucas). NUNCA versionar — contém histórico/secrets de outros repos.
$ENTRY
EOF
  echo "✅ Adicionado ao .gitignore: $ENTRY"
fi
```

### 3. Validar

```bash
ls /home/lucrecia/openclaw-mythos-puro/backend-sdk-claude/symlink/projects/ > /dev/null && \
  echo "✅ Symlink legível. Projetos acessíveis: $(ls /home/lucrecia/openclaw-mythos-puro/backend-sdk-claude/symlink/projects/ | wc -l)"

cd /home/lucrecia/openclaw-mythos-puro && \
  git check-ignore -v backend-sdk-claude/symlink/projects && \
  echo "✅ Confirmado: git está ignorando o symlink"
```

## Casos de borda

- **`/home/lucrecia/.claude/projects` não existe** → algo está muito errado com a instalação Claude Code. NÃO criar o symlink apontando pra path inexistente; reporta pro usuário.
- **`.gitignore` não existe** na raiz do repo → criar com a entrada (caso muito raro, repo é versionado).
- **Symlink existe mas aponta pra destino antigo (ex: outro user/home)** → não toca, reporta. Provavelmente é restauração de backup que migrou de máquina.
- **Não rodar `git add`/`git commit`** dentro dessa skill. Só prepara o estado local; commit do `.gitignore` é decisão do usuário em outro fluxo.
