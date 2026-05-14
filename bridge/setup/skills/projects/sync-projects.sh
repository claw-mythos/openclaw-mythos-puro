#!/usr/bin/env bash
# sync-projects.sh
#
# Symlinks (idempotente) cada diretório de ~/.claude/projects/ pra dentro deste
# skill, pra navegação humana das sessões a partir de bridge/setup/skills/projects/.
#
# Não afeta runtime — a skill `projects` lê sempre de ~/.claude/projects/.
# Os symlinks aqui são puramente conveniência de inspeção.
#
# Uso:
#   bash sync-projects.sh           # cria/atualiza symlinks
#   bash sync-projects.sh --prune   # remove symlinks órfãos (apontando pra projects deletados)
#   bash sync-projects.sh --clean   # remove TODOS os symlinks de projects daqui

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECTS_SRC="$HOME/.claude/projects"
MODE="${1:-sync}"

is_project_link() {
  # Considera "link de project" qualquer entrada do dir que comece com '-'
  # (convenção do Claude Code: path encoded com leading dash)
  local entry="$1"
  [[ "$(basename "$entry")" == -* ]]
}

case "$MODE" in
  sync)
    if [ ! -d "$PROJECTS_SRC" ]; then
      echo "❌ $PROJECTS_SRC não existe — Claude Code nunca rodou nesta máquina?"
      exit 1
    fi
    created=0
    skipped=0
    for src in "$PROJECTS_SRC"/-*/; do
      [ -d "$src" ] || continue
      name="$(basename "$src")"
      target="$SCRIPT_DIR/$name"
      if [ -L "$target" ]; then
        skipped=$((skipped+1))
        continue
      fi
      if [ -e "$target" ]; then
        echo "⚠️  $name já existe e NÃO é symlink — pulando."
        continue
      fi
      # Prefixo ./ evita que ln interprete o leading '-' como flag
      (cd "$SCRIPT_DIR" && ln -s "${src%/}" "./$name")
      created=$((created+1))
    done
    echo "✓ $created symlink(s) novo(s), $skipped já existente(s) em $SCRIPT_DIR"
    ;;

  --prune)
    pruned=0
    for entry in "$SCRIPT_DIR"/-*; do
      [ -L "$entry" ] || continue
      if [ ! -e "$entry" ]; then
        rm "$entry"
        echo "removed orphan: $(basename "$entry")"
        pruned=$((pruned+1))
      fi
    done
    echo "✓ $pruned órfão(s) removido(s)"
    ;;

  --clean)
    removed=0
    for entry in "$SCRIPT_DIR"/-*; do
      [ -L "$entry" ] || continue
      rm "$entry"
      removed=$((removed+1))
    done
    echo "✓ $removed symlink(s) removido(s)"
    ;;

  *)
    echo "Uso: $0 [sync|--prune|--clean]"
    exit 1
    ;;
esac
