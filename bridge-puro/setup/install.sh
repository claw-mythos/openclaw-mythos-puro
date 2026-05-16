#!/usr/bin/env bash
# bridge/setup/install.sh
#
# Symlinks os ativos versionados de TODAS as bridges pros caminhos que o
# Claude Code (CLI) e o backend descobrem automaticamente:
#
#   bridge/setup/commands/<x>.md   →  ~/.claude/commands/<x>.md
#         (slash commands globais — apenas bridge/setup/ é a fonte canônica)
#
#   bridge/<qualquer>/skills/<x>/  →  backend/.claude/skills/<x>/
#         (skills do backend HTTP — escaneia TODAS as bridges:
#          setup/, gamma/, puro/, e qualquer futura que tenha skills/)
#
# Idempotente — pode rodar quantas vezes quiser; sempre aponta pro source neste repo.
#
# Uso:
#   bash bridge/setup/install.sh             # commands global + skills de todas bridges
#   bash bridge/setup/install.sh --local     # commands em ./.claude/commands/ (escopo só projeto)
#   bash bridge/setup/install.sh --uninstall # remove só os symlinks que este script criou
#
# Settings JSON patches (em bridge/setup/settings/) NÃO são aplicados automaticamente —
# o usuário lê e cola manualmente no ~/.claude/settings.json.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BRIDGE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

COMMANDS_SRC="$SCRIPT_DIR/commands"
BACKEND_SKILLS_DIR="$PROJECT_ROOT/backend-sdk-claude/.claude/skills"
MODE="${1:-global}"

link_one() {
  local src="$1" target="$2"
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "⚠️  $target já existe (não é symlink). Renomeie/remova manualmente. Pulando."
    return 1
  fi
  # -h: NÃO seguir symlinks no target. Essencial pra evitar que `ln -sf` siga
  # um symlink existente que aponta pra diretório e crie o novo link DENTRO dele
  # (bug clássico do BSD ln que produzia loops `bridge/X/skills/Y/Y → Y`).
  ln -shf "$src" "$target"
  echo "✓ $target → $src"
  return 0
}

unlink_one() {
  local src="$1" target="$2"
  if [ -L "$target" ] && [ "$(readlink "$target")" = "$src" ]; then
    rm "$target"
    echo "removed: $target"
  fi
}

# Coleta skills de TODAS as bridges (bridge/*/skills/*/)
# Skill "real" = diretório que contém SKILL.md. O check evita confundir com
# outras coisas que podem morar em bridge/X/skills/ (ex.: symlinks de sessão
# do skill `projects` que apontam pra ~/.claude/projects/-Users-...).
collect_all_skills() {
  for bridge_dir in "$BRIDGE_ROOT"/*/; do
    [ -d "$bridge_dir" ] || continue
    local skills_dir="${bridge_dir}skills"
    [ -d "$skills_dir" ] || continue
    for skill_dir in "$skills_dir"/*/; do
      [ -d "$skill_dir" ] || continue
      [ -f "${skill_dir}SKILL.md" ] || continue
      echo "${skill_dir%/}"
    done
  done
}

case "$MODE" in
  global|--local)
    if [ "$MODE" = "--local" ]; then
      COMMANDS_TARGET_DIR="$PROJECT_ROOT/.claude/commands"
    else
      COMMANDS_TARGET_DIR="$HOME/.claude/commands"
    fi

    mkdir -p "$COMMANDS_TARGET_DIR" "$BACKEND_SKILLS_DIR"

    cmd_count=0
    if [ -d "$COMMANDS_SRC" ]; then
      for src in "$COMMANDS_SRC"/*.md; do
        [ -e "$src" ] || continue
        link_one "$src" "$COMMANDS_TARGET_DIR/$(basename "$src")" && cmd_count=$((cmd_count+1))
      done
    fi

    skill_count=0
    while IFS= read -r src; do
      [ -n "$src" ] || continue
      link_one "$src" "$BACKEND_SKILLS_DIR/$(basename "$src")" && skill_count=$((skill_count+1))
    done < <(collect_all_skills)

    echo
    echo "✅ $cmd_count slash command(s) em $COMMANDS_TARGET_DIR"
    echo "✅ $skill_count skill(s) do backend em $BACKEND_SKILLS_DIR"
    echo
    if [ "$cmd_count" -gt 0 ]; then
      echo "Próximo prompt no Claude, digite '/' pra ver:"
      for src in "$COMMANDS_SRC"/*.md; do
        [ -e "$src" ] || continue
        echo "   /$(basename "$src" .md)"
      done
      echo
    fi
    if [ "$skill_count" -gt 0 ]; then
      echo "Skills do backend (descobertas no próximo restart do servidor):"
      while IFS= read -r src; do
        [ -n "$src" ] || continue
        # Mostra de qual bridge veio: bridge/<X>/skills/<skill>
        bridge_name=$(echo "$src" | sed -E "s|^$BRIDGE_ROOT/([^/]+)/skills/.*|\\1|")
        echo "   - $(basename "$src")    [bridge/$bridge_name]"
      done < <(collect_all_skills)
      echo
    fi
    echo "Settings (não-automáticos) — leia e aplique manualmente:"
    for s in "$SCRIPT_DIR/settings"/*.md; do
      [ -e "$s" ] || continue
      echo "   - $s"
    done

    # Sincroniza diretórios de ~/.claude/projects/ pra dentro da skill `projects`
    # (navegação humana — não afeta runtime do backend nem da skill)
    PROJECTS_SYNC="$SCRIPT_DIR/skills/projects/sync-projects.sh"
    if [ -x "$PROJECTS_SYNC" ]; then
      echo
      echo "Sincronizando ~/.claude/projects/ → skills/projects/ ..."
      bash "$PROJECTS_SYNC"
    fi
    ;;

  --uninstall)
    if [ -d "$COMMANDS_SRC" ]; then
      for src in "$COMMANDS_SRC"/*.md; do
        [ -e "$src" ] || continue
        for target in "$HOME/.claude/commands/$(basename "$src")" "$PROJECT_ROOT/.claude/commands/$(basename "$src")"; do
          unlink_one "$src" "$target"
        done
      done
    fi
    while IFS= read -r src; do
      [ -n "$src" ] || continue
      unlink_one "$src" "$BACKEND_SKILLS_DIR/$(basename "$src")"
    done < <(collect_all_skills)

    # Limpa symlinks de projects criados pelo sync-projects.sh
    PROJECTS_SYNC="$SCRIPT_DIR/skills/projects/sync-projects.sh"
    if [ -x "$PROJECTS_SYNC" ]; then
      bash "$PROJECTS_SYNC" --clean
    fi
    echo "✅ uninstall concluído"
    ;;

  *)
    echo "Uso: $0 [global|--local|--uninstall]"
    exit 1
    ;;
esac
