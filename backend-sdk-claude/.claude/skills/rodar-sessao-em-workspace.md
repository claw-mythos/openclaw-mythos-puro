---
name: rodar-sessao-em-workspace
description: Dispara uma sessão Claude no backend puro com `workspace` (cwd) customizado e mostra o transcript JSONL aparecendo dentro do symlink local. Use SEMPRE que o usuário pedir "roda uma sessão em <pasta>", "dispara task no backend dentro de <pasta>", "quero ver gerar transcript em tal pasta", "testa o backend criando sessão em grupos/<x>", "ver JSONL aparecer", "demo do encoded-cwd". Cobre o passo-a-passo completo + a pegadinha do file explorer/IDE que NÃO atualiza automaticamente quando aparece pasta nova no filesystem.
---

# Rodar sessão Claude do backend com workspace customizado

## O que essa skill faz

1. Garante que o **backend está de pé** em uma porta livre (default 18888).
2. Garante que a **pasta de workspace existe** (cria se necessário).
3. Dispara `POST /api/tasks` com `workspace` apontando pra essa pasta.
4. Acompanha a criação da pasta `~/.claude/projects/<encoded-cwd>/` em tempo real (visível via `symlink/projects/` do projeto, conforme skill [[recriar-symlink-projects]]).
5. Inspeciona o `.jsonl` gerado pra confirmar que a sessão fechou limpa.

## Convenção `encoded-cwd`

O CLI Claude grava transcript em `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl` onde:

```
/home/lucrecia/openclaw-mythos-puro/backend-sdk-claude/grupos/faturas
→ -home-lucrecia-openclaw-mythos-puro-backend-sdk-claude-grupos-faturas
```

Regra: substitui cada `/` por `-`, prefix `-` no início. **Não é configurável** — é o jeito que o CLI Claude funciona.

## Passos

### 1. Garantir backend up

```bash
BASE=http://127.0.0.1:18888
AUTH="Authorization: Bearer testkey"

if ! curl -sf -o /dev/null "$BASE/api/health"; then
  echo "⚠️  Backend não está em :18888 — subindo agora..."
  cd /home/lucrecia/openclaw-mythos-puro/backend-sdk-claude
  PORT=18888 API_BEARER_SECRET=testkey nohup node server.js > /tmp/mythos-puro.log 2>&1 &
  sleep 3
fi

curl -s -o /dev/null -w "health=%{http_code}\n" "$BASE/api/health"
```

### 2. Garantir pasta de workspace

```bash
WS=/home/lucrecia/openclaw-mythos-puro/backend-sdk-claude/grupos/faturas   # ← trocar pra pasta desejada
mkdir -p "$WS"
ls -la "$WS"
```

### 3. Disparar task

```bash
TASK=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d "{
    \"prompt\":\"Em 1 linha, diga quantos arquivos tem em pwd. Responda apenas o número.\",
    \"workspace\":\"$WS\",
    \"maxTurns\":5
  }" \
  "$BASE/api/tasks")
TASK_ID=$(echo "$TASK" | grep -oP '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
echo "task_id=$TASK_ID"
```

**Dica:** `maxTurns:1` é insuficiente pro Claude sempre — costuma cair em `max_turns_reached` no primeiro tool_use. Use `5+`.

### 4. Acompanhar pasta aparecer no symlink

```bash
ENCODED=$(echo "$WS" | sed 's|/|-|g')      # transforma cwd em nome de pasta
SYMLINK=/home/lucrecia/openclaw-mythos-puro/backend-sdk-claude/symlink/projects
TARGET="$SYMLINK/$ENCODED"

for i in 1 2 3 4 5 6; do
  sleep 4
  if [ -d "$TARGET" ]; then
    echo "T+${i}0s | ✅ pasta criada | task: $(curl -s -H "$AUTH" "$BASE/api/tasks/$TASK_ID" | grep -oP '"status":"[^"]+"' | head -1)"
  else
    echo "T+${i}0s | ⏳ aguardando..."
  fi
done

echo
echo "=== JSONL gerado ==="
ls -la "$TARGET/"
```

### 5. Inspecionar o JSONL (sessão fechou limpa?)

```bash
JSONL=$(ls "$TARGET"/*.jsonl | head -1)
echo "Tipos no JSONL:"
jq -r '.type' "$JSONL" | sort | uniq -c
echo
echo "Resposta final:"
jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' "$JSONL" | tail -3
```

**Schema esperado** (mesmo do irmão `lucrecia`):
- `queue-operation` (enqueue + dequeue do CLI)
- `user` (prompt do usuário + tool_results)
- `assistant` (respostas do Claude + tool_uses)
- `attachment` (anexos do CLI, ex: `max_turns_reached`)
- `last-prompt` (registro do prompt final)

## ⚠️ Pegadinha: IDE/file explorer NÃO atualiza sozinho

Se você está olhando a pasta `symlink/projects/` no VS Code, Cursor, Finder ou outro file explorer **e a pasta nova não apareceu mesmo o filesystem confirmando que ela existe**:

1. **NÃO É BUG.** O filesystem criou a pasta corretamente — o IDE só não fez refresh.
2. Soluções:
   - **VS Code/Cursor:** clique direito no painel do explorer → "Refresh"  (ou tecla `F5`)
   - **Finder (macOS):** `Cmd+Option+Esc` → relaunch ou simplesmente sai e volta na pasta
   - **Terminal puro:** `ls` sempre mostra estado real, não tem cache
3. **Por que acontece:** symlinks pra fora da árvore versionada (caso de `symlink/projects → ~/.claude/projects`) muitas vezes não disparam o file watcher do IDE quando o filesystem-alvo recebe mudança. O IDE só vê quando explicitamente lê o diretório de novo.

**Sempre confirme pelo terminal antes de assumir que falhou:**

```bash
ls /home/lucrecia/openclaw-mythos-puro/backend-sdk-claude/symlink/projects/ | grep grupos-faturas
```

Se o `ls` mostra mas o IDE não, é IDE — não é a skill.

## Casos de borda

- **Backend não responde** → confere se outra coisa tá usando :18888 (`ss -tln | grep 18888`). Mata + relança.
- **Task fica `running` pra sempre** → CLI Claude pode estar autenticado em outro modelo/conta. Olha `/tmp/mythos-puro.log` pra ver stderr do spawn.
- **JSONL não aparece mesmo após task `done`** → confere se o symlink `symlink/projects` está correto (use skill [[recriar-symlink-projects]] se sumiu) e se `~/.claude/projects/<encoded>/` foi de fato criado (`ls ~/.claude/projects/`).
- **Permissão 700 nas pastas** → o CLI Claude cria com `drwx------`. Só o user `lucrecia` enxerga. Não é problema, só não compartilha entre users.
- **Pasta encoded com `puro` vs `lucrecia`** → fácil confundir visualmente porque os nomes só diferem no meio. Ex: `-home-lucrecia-openclaw-mythos-puro-...` (este projeto) vs `-home-lucrecia-openclaw-mythos-lucrecia-...` (irmão). Confere o meio do nome.

## Não fazer

- **NÃO** colocar workspace fora de `/home/lucrecia/openclaw-mythos-puro/` sem necessidade. Cada cwd gera uma pasta no `~/.claude/projects/` — proliferação rápido vira lixo.
- **NÃO** persistir `task-id` em commit — UUIDs são efêmeros, só vivem em `data/tasks.json`.
- **NÃO** abrir o JSONL e editar — é append-only por design do CLI Claude.
