// Test pro handler agents/run-agent — mocka claude-query.query() async generator.
// Mocka fs pra prover uma whitelist de agentes determinística sem depender de
// ~/.claude/agents/ real do desenvolvedor.

jest.mock('../../claude-query', () => ({
  query: jest.fn(),
}));

// Mocka fs ANTES de require do handler — handler lê ~/.claude/agents/ no load.
// Factory de jest.mock não pode referenciar variáveis fora de escopo, então
// `require` é feito inline e basename calculado manualmente.
jest.mock('fs', () => {
  const realFs = jest.requireActual('fs');
  return {
    ...realFs,
    existsSync: jest.fn(p => {
      if (typeof p === 'string' && p.endsWith('/agents')) return true;
      return realFs.existsSync(p);
    }),
    readdirSync: jest.fn((p, opts) => {
      if (typeof p === 'string' && p.endsWith('/agents')) {
        return ['agent-allowed.md', 'puro-executor.md', 'agent-second.md'];
      }
      return realFs.readdirSync(p, opts);
    }),
    readFileSync: jest.fn((p, enc) => {
      if (typeof p === 'string' && p.includes('/agents/')) {
        // basename inline (sem require de path no factory)
        const base = String(p).split('/').pop().replace(/\.md$/, '');
        return `---\nname: ${base}\ndescription: test\ntools: Read\n---\n\nbody`;
      }
      return realFs.readFileSync(p, enc);
    }),
  };
});

const { query } = require('../../claude-query');
const { handle, listAgents, AGENTS_ALLOWED } = require('../../services/agents/run-agent');

function* mockMessages(opts = {}) {
  yield { type: 'system', subtype: 'init', model: opts.model || 'claude-opus-4-6' };
  yield { type: 'assistant', message: { content: [{ type: 'text', text: opts.text || 'ok' }] } };
  yield {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: opts.text || 'ok',
    duration_ms: 1234,
    num_turns: 1,
    total_cost_usd: 0.05,
  };
}

describe('agents run-agent handler', () => {
  beforeEach(() => jest.clearAllMocks());

  test('agente válido monta prompt instrutivo com Task tool', async () => {
    query.mockImplementation(async function* () { yield* mockMessages({ text: 'feito' }); });

    const r = await handle({ agent: 'agent-allowed', prompt: 'liste padrões' });
    expect(r.ok).toBe(true);
    expect(r.result).toBe('feito');
    expect(r.agent).toBe('agent-allowed');

    const callArgs = query.mock.calls[0][0];
    expect(callArgs.prompt).toContain("subagent_type='agent-allowed'");
    expect(callArgs.prompt).toContain("liste padrões");
    expect(callArgs.options.allowedTools).toEqual(['Task']);
    expect(callArgs.options.permissionMode).toBe('bypassPermissions');
  });

  test('agente fora whitelist → ok:false sem chamar query', async () => {
    const r = await handle({ agent: 'agent-inventado', prompt: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/whitelist/);
    expect(query).not.toHaveBeenCalled();
  });

  test('agente destrutivo (HTTP_DENY) → ok:false', async () => {
    const r = await handle({ agent: 'puro-executor', prompt: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/whitelist/);
    expect(query).not.toHaveBeenCalled();
  });

  test('agent ausente → ok:false', async () => {
    const r = await handle({ prompt: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/agent obrigat/);
  });

  test('prompt vazio → ok:false sem chamar query', async () => {
    const r = await handle({ agent: 'agent-allowed', prompt: '' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/prompt obrigat/);
    expect(query).not.toHaveBeenCalled();
  });

  test('result com is_error → propaga erro', async () => {
    query.mockImplementation(async function* () {
      yield { type: 'system', subtype: 'init', model: 'claude-opus-4-6' };
      yield { type: 'result', is_error: true, result: 'agente quebrou', duration_ms: 100, num_turns: 0, total_cost_usd: 0 };
    });

    const r = await handle({ agent: 'agent-allowed', prompt: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/agente quebrou/);
  });

  test('query lança exceção → ok:false', async () => {
    query.mockImplementation(async function* () { throw new Error('spawn EACCES'); });

    const r = await handle({ agent: 'agent-allowed', prompt: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/spawn EACCES/);
  });

  test('sem result event → ok:false (timeout/abort)', async () => {
    query.mockImplementation(async function* () {
      yield { type: 'system', subtype: 'init', model: 'm' };
      // sem result event
    });

    const r = await handle({ agent: 'agent-allowed', prompt: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/sem evento result/);
  });

  test('listAgents retorna whitelist filtrada (sem destrutivos)', () => {
    const list = listAgents();
    expect(list).toContain('agent-allowed');
    expect(list).toContain('agent-second');
    expect(list).not.toContain('puro-executor');
  });

  test('escape de aspas simples no prompt do usuário', async () => {
    query.mockImplementation(async function* () { yield* mockMessages(); });

    await handle({ agent: 'agent-allowed', prompt: "use o que tá no 'X'" });
    const callArgs = query.mock.calls[0][0];
    expect(callArgs.prompt).toContain("\\'X\\'");
  });
});
