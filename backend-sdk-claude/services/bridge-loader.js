// bridge-loader.js — API de plugin do motor + auto-discovery de bridges.
//
// Convenção: cada bridge mora em ../bridge-<nome>/index.js (relativo ao diretório
// pai do backend-sdk-claude) e exporta { init(ctx): async fn }.
//
// O motor (server.js) chama loadBridges({ app, io, logger, ... }) ANTES de
// server.listen pra que rotas e crons estejam prontos quando conexões chegam.
//
// API exposta no `ctx` que cada bridge.init recebe:
//   ctx.app, ctx.io, ctx.logger, ctx.taskRunner, ctx.sessionContextManager,
//   ctx.healthChecker, ctx.claudeQuery, ctx.paths
//   ctx.registerHttpHandler(method, path, ...handlers)
//   ctx.registerWebhook(path, asyncHandler, opts?)
//   ctx.registerCron(spec)
//   ctx.registerCronRegistry(registryModule)
//   ctx.registerSocketEvent(eventName, handler)
//
// Spec de cron registrado via ctx.registerCron / ctx.registerCronRegistry({ JOBS: [...] }):
//   { name, hourBR, minuteBR, weekdaysBR?, monthDaysBR?, fn }
//
// Isolamento: bridge que falha em init() é logada e o motor continua subindo.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TZ = 'America/Sao_Paulo';

function getNowBR() {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    hour: '2-digit', minute: '2-digit', weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = fmt.formatToParts(d);
  const get = (type) => parts.find(p => p.type === type)?.value;
  return {
    hour: parseInt(get('hour')),
    minute: parseInt(get('minute')),
    weekday: d.getDay(),
    monthDay: parseInt(get('day')),
    iso: `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`,
  };
}

function constantTimeBearer(req, expectedList) {
  // expectedList: string OR array of strings (any match wins; usado pra fallback CRM→READAI)
  const list = Array.isArray(expectedList) ? expectedList : [expectedList];
  const auth = req.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return false;
  const a = Buffer.from(m[1]);
  for (const exp of list) {
    if (!exp) continue;
    const b = Buffer.from(exp);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

function createBridgeContext({ app, io, logger, taskRunner, sessionContextManager,
                               healthChecker, claudeQuery, paths, _cronJobs }) {
  return {
    app, io, logger, taskRunner, sessionContextManager, healthChecker, claudeQuery, paths,

    registerHttpHandler(method, route, ...handlers) {
      const m = String(method).toLowerCase();
      if (typeof app[m] !== 'function') {
        throw new Error(`registerHttpHandler: bad method ${method}`);
      }
      app[m](route, ...handlers);
      logger.info(`[bridge] ${m.toUpperCase()} ${route}`);
    },

    registerWebhook(route, handler, opts = {}) {
      // opts.bearerEnv: string OU array — primeiro preenchido vence; envs ausentes pulam
      // opts.method: default 'post' (webhooks são POST). Pra GET/DELETE com auth, usar registerHttpHandler ou mudar method.
      const method = String(opts.method || 'post').toLowerCase();
      const envs = opts.bearerEnv ? (Array.isArray(opts.bearerEnv) ? opts.bearerEnv : [opts.bearerEnv]) : null;
      app[method](route, async (req, res) => {
        if (envs) {
          const expectedList = envs.map(e => process.env[e]).filter(Boolean);
          if (!expectedList.length) {
            logger.error(`[webhook ${route}]: nenhum dos envs ${envs.join(',')} configurado`);
            return res.status(500).json({ ok: false, error: `server misconfigured: ${envs[0]} ausente` });
          }
          if (!constantTimeBearer(req, expectedList)) {
            return res.status(401).json({ ok: false, error: 'unauthorized' });
          }
        }
        try {
          const body = (method === 'get' || method === 'delete') ? (req.query || {}) : (req.body || {});
          const out = await handler(body, req.headers || {}, req);
          if (res.headersSent) return;
          res.json(out === undefined ? { ok: true } : out);
        } catch (err) {
          logger.error(`[webhook ${route}]`, err && (err.stack || err.message));
          if (res.headersSent) return;
          res.status(500).json({ ok: false, error: err.message });
        }
      });
      logger.info(`[bridge] ${method.toUpperCase()} ${route} (webhook${envs ? ` auth:${envs.join('|')}` : ''})`);
    },

    registerCron(spec) {
      if (!spec || !spec.name || typeof spec.fn !== 'function') {
        throw new Error('registerCron: spec.name e spec.fn obrigatórios');
      }
      _cronJobs.push(spec);
    },

    registerCronRegistry(mod) {
      if (!mod || !Array.isArray(mod.JOBS)) {
        throw new Error('registerCronRegistry: módulo precisa exportar JOBS:Array');
      }
      mod.JOBS.forEach(j => _cronJobs.push(j));
    },

    registerSocketEvent(eventName, handler) {
      io.on('connection', socket => {
        socket.on(eventName, (data, ack) => handler(socket, data, ack));
      });
      logger.info(`[bridge] socket event '${eventName}'`);
    },
  };
}

function startGlobalCronTick(jobs, logger) {
  if (process.env.CRM_CRONS_ENABLED !== '1') {
    logger.info(`[bridge-loader] cron tick disabled (set CRM_CRONS_ENABLED=1) — ${jobs.length} job(s) registrados mas não disparam`);
    return null;
  }
  const lastFiredAt = new Map(); // jobName -> fireKey
  async function tick() {
    const now = getNowBR();
    for (const job of jobs) {
      if (job.weekdaysBR && !job.weekdaysBR.includes(now.weekday)) continue;
      if (job.monthDaysBR && !job.monthDaysBR.includes(now.monthDay)) continue;
      if (now.hour !== job.hourBR || now.minute !== job.minuteBR) continue;
      const fireKey = `${job.name}|${now.iso}`;
      if (lastFiredAt.get(job.name) === fireKey) continue;
      lastFiredAt.set(job.name, fireKey);
      (async () => {
        const startedAt = Date.now();
        try {
          const result = await job.fn();
          logger.info(`[crons] ${job.name} ok (${Date.now() - startedAt}ms): ${JSON.stringify({ ok: result?.ok, action: result?.action, sendOk: result?.sendResult?.ok })}`);
        } catch (err) {
          logger.error(`[crons] ${job.name} ERROR (${Date.now() - startedAt}ms):`, err.message);
        }
      })();
    }
  }
  const handle = setInterval(tick, 60_000);
  // Tick imediato (não dispara nada agora porque idempotência segura — só sincroniza estado)
  tick().catch(e => logger.error('[bridge-loader] initial tick error:', e.message));
  logger.info(`[bridge-loader] cron tick started — ${jobs.length} job(s) registrados`);
  return handle;
}

async function loadBridges({ app, io, logger, taskRunner, sessionContextManager,
                             healthChecker, claudeQuery }) {
  // Diretório raiz do projeto = pai do backend-sdk-claude (onde estão os bridge-*)
  const projectRoot = path.resolve(__dirname, '..', '..');
  const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
  const candidates = entries
    .filter(e => e.isDirectory() && e.name.startsWith('bridge-'))
    .map(e => path.join(projectRoot, e.name));

  if (!candidates.length) {
    logger.info('[bridge-loader] nenhuma bridge encontrada (esperado bridge-*/index.js em ' + projectRoot + ')');
    return { loaded: [], cronHandle: null };
  }

  const allCronJobs = [];
  const loaded = [];

  for (const dir of candidates) {
    const name = path.basename(dir);
    const indexPath = path.join(dir, 'index.js');
    if (!fs.existsSync(indexPath)) {
      logger.warn(`[bridge-loader] ${name}: index.js não encontrado, pulando`);
      continue;
    }
    try {
      const bridgeModule = require(indexPath);
      if (typeof bridgeModule.init !== 'function') {
        logger.warn(`[bridge-loader] ${name}: index.js não exporta init(ctx), pulando`);
        continue;
      }
      const ctx = createBridgeContext({
        app, io, logger, taskRunner, sessionContextManager, healthChecker, claudeQuery,
        paths: {
          backendRoot: path.resolve(__dirname, '..'),
          bridgeRoot: dir,
          dataDir: path.join(dir, 'data'),
          secretsDir: path.join(dir, '.secrets'),
        },
        _cronJobs: allCronJobs,
      });
      const beforeCount = allCronJobs.length;
      await bridgeModule.init(ctx);
      const addedCrons = allCronJobs.length - beforeCount;
      loaded.push({ name, addedCrons });
      logger.info(`[bridge-loader] loaded ${name} (+${addedCrons} crons)`);
    } catch (err) {
      logger.error(`[bridge-loader] FAILED to load ${name}: ${err && (err.stack || err.message)}`);
    }
  }

  const cronHandle = startGlobalCronTick(allCronJobs, logger);
  return { loaded, cronHandle, totalCrons: allCronJobs.length };
}

module.exports = { loadBridges, createBridgeContext, getNowBR, startGlobalCronTick };
