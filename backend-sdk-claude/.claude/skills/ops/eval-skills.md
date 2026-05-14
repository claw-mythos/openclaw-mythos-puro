---
name: eval-skills
description: Avalia todas as skills do openclaw-mythos. Testa cada uma, mede impacto, mantém as úteis e remove as obsoletas. Atualiza código legado.
---

# Avaliação de Skills

Ciclo de teste e avaliação de todas as skills disponíveis.

## 1. Inventariar skills

```bash
find /Users/2a/.claude/batalha/openclaw-mythos/backend/.claude/skills -name "*.md" | while read f; do
  name=$(head -5 "$f" | grep "name:" | sed 's/name: //')
  desc=$(head -5 "$f" | grep "description:" | sed 's/description: //')
  echo "$name | $desc | $f"
done
```

## 2. Verificar histórico de uso

```bash
curl -s "http://localhost:3456/api/tasks" | python3 -c "
import sys, json
d = json.load(sys.stdin)
from collections import Counter
prompts = Counter()
for t in d['tasks']:
    p = t['prompt'].split()[0] if t['prompt'].startswith('/') else 'raw'
    prompts[p] += 1
for k,v in prompts.most_common(): print(f'{v:>3}x | {k}')
"
```

## 3. Para cada skill, avaliar

Critérios de avaliação:

| Critério | Peso |
|----------|------|
| Relevância para o openclaw-mythos | Alto |
| Já foi executada com sucesso? | Alto |
| Reflete o estado atual do código? | Médio |
| Poderia ser substituída por outra skill? | Baixo |

### Categorias de resultado

- **MANTER** — útil, testada, atualizada
- **ATUALIZAR** — útil mas desatualizada (portas, paths, nomes errados)
- **DESCONTINUAR** — não faz sentido para o openclaw-mythos atual

## 4. Para skills a ATUALIZAR

Ler o conteúdo da skill, comparar com o código atual, editar o arquivo .md corrigindo:
- Portas desatualizadas
- Paths que não existem mais
- Referências a funcionalidades removidas
- Adicionar steps faltando

## 5. Para skills a DESCONTINUAR

Mover para uma pasta de arquivo morto:
```bash
mkdir -p /Users/2a/.claude/batalha/openclaw-mythos/backend/.claude/skills/_archived
mv <skill_file> /Users/2a/.claude/batalha/openclaw-mythos/backend/.claude/skills/_archived/
```

## 6. Registrar resultado

Atualizar data/memory/debts.json se encontrar novos débitos.

Produzir relatório:
- Skills mantidas (com justificativa)
- Skills atualizadas (o que mudou)
- Skills descontinuadas (por quê)
- Novos débitos encontrados
