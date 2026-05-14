// Test pro paralelismo do task-runner — valida que múltiplos workers rodam
// concorrentemente (até MAX_WORKERS) ao invés de serializar via guard.
//
// Estratégia: mocka claude-query.query() pra yieldar lentamente (cada msg
// com setTimeout). Cria 4 tasks; verifica que as 4 entram em `running` antes
// da primeira terminar.

// Forçar MAX_WORKERS=4 antes de require do task-runner (lido no module load)
process.env.MAX_CLAUDE_PROCESSES = '4';

jest.mock('../../claude-query', () => ({
  query: jest.fn(),
  isThrottled: jest.fn(() => false),
  getActiveProcessCount: jest.fn(() => 0),
  getMemoryUsagePercent: jest.fn(() => 50),
}));

// memory-store é dependência indireta — mocka pra evitar I/O
jest.mock('../../services/memory-store', () => ({
  readMany: jest.fn(() => ({ findings: [], debts: [], changelog: [] })),
  append: jest.fn(),
}));

// fs-extra: writeJsonSync vira no-op pra não escrever em backend/data/tasks.json
// durante o teste. readJsonSync devolve [] pra start limpo.
jest.mock('fs-extra', () => ({
  ensureDirSync: jest.fn(),
  existsSync: jest.fn(() => false),
  readJsonSync: jest.fn(() => []),
  writeJsonSync: jest.fn(),
}));

const { query } = require('../../claude-query');
const taskRunner = require('../../services/task-runner');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Cria um async generator que demora `ms` antes de yieldar o result.
// Permite medir overlap de execução entre múltiplos workers.
function slowQuery(ms = 300, opts = {}) {
  return async function* () {
    yield { type: 'system', subtype: 'init', model: 'claude-opus-4-6' };
    await sleep(ms);
    yield { type: 'assistant', message: { content: [{ type: 'text', text: opts.text || 'ok' }] } };
    yield {
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: opts.text || 'ok',
      duration_ms: ms,
      num_turns: 1,
      total_cost_usd: 0.01,
    };
  };
}

afterAll(() => {
  try { fs.rmSync(TMP_TASKS_DIR, { recursive: true, force: true }); } catch (_) {}
});

describe('task-runner paralelismo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Limpa estado interno (não há reset oficial — usamos a fila)
  });

  test('4 tasks com slowQuery rodam em paralelo, não serial', async () => {
    query.mockImplementation(slowQuery(200));

    const t0 = Date.now();
    const tasks = [];
    for (let i = 0; i < 4; i++) {
      tasks.push(taskRunner.createTask({ prompt: `task ${i}`, maxTurns: 1, source: 'test' }));
    }

    // Aguarda todas terminarem (com folga de 4x duração se fosse serial)
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const allDone = tasks.every(t => {
        const t2 = taskRunner.getTask(t.id);
        return t2 && (t2.status === 'done' || t2.status === 'error' || t2.status === 'cancelled');
      });
      if (allDone) break;
      await sleep(50);
    }

    const elapsed = Date.now() - t0;
    // Serial seria 4 * 200 = 800ms. Paralelo deve ficar perto de 200-400ms.
    expect(elapsed).toBeLessThan(700);

    // Todas terminaram com sucesso
    for (const t of tasks) {
      const final = taskRunner.getTask(t.id);
      expect(final.status).toBe('done');
    }
  }, 5000);

  test('startedAt das 4 tasks ficam dentro de uma janela pequena', async () => {
    query.mockImplementation(slowQuery(200));

    const tasks = [];
    for (let i = 0; i < 4; i++) {
      tasks.push(taskRunner.createTask({ prompt: `burst ${i}`, maxTurns: 1, source: 'test' }));
    }

    // Espera os 4 chegarem em status 'running' ou 'done'
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const allStarted = tasks.every(t => {
        const t2 = taskRunner.getTask(t.id);
        return t2 && t2.startedAt !== null;
      });
      if (allStarted) break;
      await sleep(20);
    }

    const startedAts = tasks.map(t => taskRunner.getTask(t.id).startedAt);
    expect(startedAts.every(s => s !== null)).toBe(true);

    const min = Math.min(...startedAts);
    const max = Math.max(...startedAts);
    // Em paralelo, todas começam em até ~100ms da primeira (margem pra event loop)
    expect(max - min).toBeLessThan(150);

    // Cleanup: esperar as tasks terminarem pra não vazar
    const cleanupDeadline = Date.now() + 1500;
    while (Date.now() < cleanupDeadline) {
      const allDone = tasks.every(t => {
        const t2 = taskRunner.getTask(t.id);
        return t2 && (t2.status === 'done' || t2.status === 'error');
      });
      if (allDone) break;
      await sleep(50);
    }
  }, 5000);

  test('createTask com agent envolve prompt em Task tool dispatch', () => {
    query.mockImplementation(slowQuery(50));

    const task = taskRunner.createTask({
      prompt: 'analise o repo',
      agent: 'puro-pattern-mapper',
      maxTurns: 1,
      source: 'test',
    });

    expect(task.agent).toBe('puro-pattern-mapper');
    expect(task.originalPrompt).toBe('analise o repo');
    expect(task.prompt).toContain("subagent_type='puro-pattern-mapper'");
    expect(task.prompt).toContain('analise o repo');
    expect(task.tags).toContain('agent');
    expect(task.tags).toContain('agent:puro-pattern-mapper');
  });
});
