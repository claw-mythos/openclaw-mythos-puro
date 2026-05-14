# bridge/setup

**Configurações e slash commands customizáveis pra trabalhar com este projeto no Claude Code.**

Tudo aqui é versionado no repositório — qualquer pessoa que clone pode ajustar conforme prefere ou copiar/symlinkar pra sua config global.

## O que tem

```
bridge/setup/
  install.sh                      # instala/desinstala todos os assets via symlink
  commands/                       # slash commands → ~/.claude/commands/
    projects-absorb-auto.md       # /projects-absorb-auto   — automatizado, sem perguntas
    projects-absorb-guided.md     # /projects-absorb-guided — tutorial em 5 estágios
  skills/                         # skills do backend → backend/.claude/skills/
    projects/                     # ler/inspecionar sessões em ~/.claude/projects/
    projects-absorb/              # absorber + arquivar sessões (3 estágios com gate)
  settings/                       # patches de ~/.claude/settings.json (manuais)
    sandbox-allow-env.md          # libera leitura do backend/.env no sandbox
  projects/                       # docs + exemplos da bridge "projects"
```

**Convenção:** o `install.sh` escaneia **todas** as bridges (`bridge/<nome>/skills/`) — não apenas `setup/`. Qualquer bridge que tenha uma pasta `skills/` tem suas skills auto-symlinkadas pro backend. Hoje:

| Bridge | Origem das skills |
|---|---|
| `bridge/setup/skills/` | `projects`, `projects-absorb` (criadas neste setup) |
| `bridge/puro/skills/` | 73 skills do framework GSD |
| `bridge/gamma/skills/` | (vazio — `gerar-slides` ainda mora direto em `backend/.claude/skills/gerar-slides/`) |

## Como instalar

### Slash commands — opção rápida (recomendada)

```bash
bash bridge/setup/install.sh              # symlink em ~/.claude/commands/ (escopo global)
bash bridge/setup/install.sh --local      # symlink em ./.claude/commands/ (só este projeto)
bash bridge/setup/install.sh --uninstall  # remove os symlinks instalados por este script
```

Idempotente: pode rodar quantas vezes quiser. Como usa **symlink**, edições nos `.md` deste repo refletem automaticamente em todos os terminais.

### Slash commands — manual (alternativa)

Symlink global (qualquer projeto):
```bash
mkdir -p ~/.claude/commands
ln -sf "$(pwd)/bridge/setup/commands/projects-absorb-auto.md"   ~/.claude/commands/projects-absorb-auto.md
ln -sf "$(pwd)/bridge/setup/commands/projects-absorb-guided.md" ~/.claude/commands/projects-absorb-guided.md
```

Cópia (fica isolado, não reflete updates):
```bash
mkdir -p ~/.claude/commands
cp bridge/setup/commands/*.md ~/.claude/commands/
```

Escopo só do projeto (aparece só com `cwd` dentro daqui):
```bash
mkdir -p .claude/commands
ln -sf "$(pwd)/bridge/setup/commands/projects-absorb-auto.md"   .claude/commands/projects-absorb-auto.md
ln -sf "$(pwd)/bridge/setup/commands/projects-absorb-guided.md" .claude/commands/projects-absorb-guided.md
```

### Settings (patches em `~/.claude/settings.json`)

Cada arquivo em `settings/` é um snippet `.md` com diff/snippet pronto pra colar no seu `~/.claude/settings.json` (ou `.claude/settings.local.json` do projeto).

**Não há instalação automática** — settings é arquivo crítico, alterações são manuais e revisadas pelo dono. Abra o `.md`, leia o "porquê", aplique a parte que faz sentido pra você.

Lista atual:

| Arquivo | Resolve |
|---|---|
| `settings/sandbox-allow-env.md` | Libera leitura de `backend/.env` no sandbox (necessário pra testar `/api/skills/run` autenticado a partir do CLI Claude) |

## Como contribuir

### Slash command novo

1. Crie `bridge/setup/commands/<nome>.md` com frontmatter:
   ```markdown
   ---
   description: <o que o comando faz, para o picker>
   allowed-tools: Bash, Read, ...
   ---

   <prompt expandido para o Claude>
   ```
2. `bash bridge/setup/install.sh` (cria o symlink em `~/.claude/commands/`).
3. Comite o `.md` no repo.

### Skill nova de bridge

1. Decida em qual bridge a skill mora (ex.: `bridge/gamma/skills/nova/`, `bridge/setup/skills/nova/`, `bridge/<x>/skills/nova/`).
2. Crie `bridge/<bridge>/skills/<nome>/SKILL.md` com frontmatter `name:` e `description:`.
3. `bash bridge/setup/install.sh` (escaneia TODAS as bridges e symlinka pra `backend/.claude/skills/`).
4. **Reinicie o backend** — auto-discovery roda só no boot.
5. Comite o `SKILL.md` no repo.

### Patch de settings

1. Crie `bridge/setup/settings/<descritivo>.md` explicando: **por quê**, **o que adicionar**, **como verificar**, **como reverter**.
2. **Não** automatize a aplicação — settings.json fica sob controle do usuário.

## ⚠️ Aviso de segurança — HTTP exposure

Toda skill em `bridge/<X>/skills/` vira **pública** via `POST /api/skills/run` quando o backend reinicia (auth Bearer requerida, mas qualquer cliente autenticado pode invocar qualquer skill listada).

Isso significa que skills destrutivas (ex.: `puro-undo`, `puro-cleanup`, `puro-execute-phase`, `puro-remove-workspace`) ficam alcançáveis pela API. Antes de expor uma bridge inteira:

- **Audite** quais skills da bridge fazem sentido pro frontend invocar.
- **Considere filtrar** no `backend/services/skills/run-skill.js`: ajuste `loadLocalSkills()` pra excluir skills de certos diretórios, ou implemente uma deny-list em paralelo à whitelist atual.
- **Lembre que slash commands no CLI são separados** — quem usa `/puro-undo` no terminal não passa pela API e não exige essa proteção.

Filtragem default não está implementada — toda skill em `bridge/*/skills/` é exposta. Se a sua bridge tem skills sensíveis, **pense antes de symlinkar todas**.

## Por que aqui (e não em `~/.claude/`)

- **Versionável**: todo mundo que clona o repo enxerga o setup.
- **Customizável**: cada pessoa decide instalar ou não, e como (symlink vs cópia, global vs local).
- **Auditável**: PR review enxerga mudanças no setup.
- **Reversível**: remover o symlink/cópia volta ao estado original sem editar nada.

Se um setup é **estritamente pessoal** (ex.: seu API key, seu editor), mantenha em `~/.claude/` e não comite aqui.
