/**
 * Health Checker Service
 * Monitora o status de todos os componentes do sistema
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const execFileAsync = promisify(execFile);

function findClaudeCodePkg() {
  let dir = __dirname;
  while (true) {
    const candidate = path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

class HealthChecker {
  constructor() {
    this.checks = new Map();
    this.lastCheckTime = null;
    this.checkInterval = 30000; // 30 segundos
    this.statusCache = null;
  }

  /**
   * Verifica status do Claude Code SDK
   */
  async checkClaudeSDK() {
    const pkgPath = findClaudeCodePkg();
    if (!pkgPath) {
      return {
        name: 'Claude Code SDK',
        status: 'error',
        error: '@anthropic-ai/claude-code not installed',
      };
    }
    let sdkVersion = 'unknown';
    try {
      sdkVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
    } catch (_) {}

    let processCount = 0;
    try {
      const { stdout } = await execFileAsync('ps', ['-ax', '-o', 'command=']);
      processCount = stdout.split('\n').filter(line => /claude/i.test(line)).length;
    } catch (_) {
      processCount = 0;
    }

    return {
      name: 'Claude Code SDK',
      status: 'healthy',
      version: sdkVersion,
      processCount,
      message: processCount > 0
        ? `SDK ${sdkVersion} operational (${processCount} processes)`
        : `SDK ${sdkVersion} installed, no active processes`,
    };
  }

  /**
   * Verifica Socket.IO
   */
  async checkSocketIO(io) {
    try {
      if (!io) {
        return {
          name: 'Socket.IO',
          status: 'unavailable',
          message: 'Socket.IO not initialized'
        };
      }

      const sockets = await io.fetchSockets();
      
      return {
        name: 'Socket.IO',
        status: 'healthy',
        connectedClients: sockets.length,
        message: `${sockets.length} clients connected`
      };
    } catch (error) {
      return {
        name: 'Socket.IO',
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Verifica memória do sistema
   */
  async checkSystemMemory() {
    try {
      const memUsage = process.memoryUsage();
      const totalMemory = require('os').totalmem();
      const freeMemory = require('os').freemem();
      
      const usagePercent = ((totalMemory - freeMemory) / totalMemory) * 100;
      
      return {
        name: 'System Memory',
        status: usagePercent < 90 ? 'healthy' : 'warning',
        usage: {
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
        },
        system: {
          total: `${Math.round(totalMemory / 1024 / 1024)}MB`,
          free: `${Math.round(freeMemory / 1024 / 1024)}MB`,
          usagePercent: usagePercent.toFixed(2)
        },
        message: usagePercent < 90 ? 'Memory usage normal' : 'High memory usage detected'
      };
    } catch (error) {
      return {
        name: 'System Memory',
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Verifica status de throttle de processos
   */
  checkThrottleStatus() {
    const claudeQuery = require('../claude-query');
    const active = claudeQuery.getActiveProcessCount();
    const memPct = claudeQuery.getMemoryUsagePercent();
    const throttled = claudeQuery.isThrottled();
    const max = parseInt(process.env.MAX_CLAUDE_PROCESSES || '2');
    const threshold = parseInt(process.env.MEMORY_THROTTLE_PERCENT || '85');

    return {
      name: 'Process Throttle',
      status: throttled ? 'throttled' : 'healthy',
      activeProcesses: active,
      maxProcesses: max,
      memoryPercent: memPct.toFixed(1),
      throttleThreshold: threshold,
      throttled,
      message: throttled
        ? `Throttled: ${active}/${max} processes, ${memPct.toFixed(1)}% memory`
        : `OK: ${active}/${max} processes, ${memPct.toFixed(1)}% memory`
    };
  }

  /**
   * Executa todos os health checks
   */
  async performFullCheck(dependencies = {}) {
    const {
      io
    } = dependencies;

    const checks = await Promise.all([
      this.checkClaudeSDK(),
      this.checkSocketIO(io),
      this.checkSystemMemory(),
      Promise.resolve(this.checkThrottleStatus())
    ]);

    const overallStatus = this.calculateOverallStatus(checks);
    
    const result = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: checks.reduce((acc, check) => {
        acc[check.name.toLowerCase().replace(/\s+/g, '_')] = check;
        return acc;
      }, {}),
      summary: {
        total: checks.length,
        healthy: checks.filter(c => c.status === 'healthy').length,
        unhealthy: checks.filter(c => c.status === 'unhealthy').length,
        errors: checks.filter(c => c.status === 'error').length,
        warnings: checks.filter(c => c.status === 'warning').length
      }
    };

    this.statusCache = result;
    this.lastCheckTime = Date.now();
    
    return result;
  }

  /**
   * Calcula status geral baseado nos checks individuais
   */
  calculateOverallStatus(checks) {
    const hasErrors = checks.some(c => c.status === 'error');
    const hasUnhealthy = checks.some(c => c.status === 'unhealthy');
    const hasWarnings = checks.some(c => c.status === 'warning' || c.status === 'throttled');

    if (hasErrors || hasUnhealthy) return 'unhealthy';
    if (hasWarnings) return 'degraded';
    return 'healthy';
  }

  /**
   * Retorna status em cache se recente
   */
  getCachedStatus() {
    if (this.statusCache && this.lastCheckTime) {
      const age = Date.now() - this.lastCheckTime;
      if (age < this.checkInterval) {
        return {
          ...this.statusCache,
          cached: true,
          cacheAge: Math.round(age / 1000)
        };
      }
    }
    return null;
  }

  /**
   * Inicia monitoramento automático
   */
  startMonitoring(dependencies, interval = 30000) {
    this.checkInterval = interval;
    
    // Executa primeira verificação
    this.performFullCheck(dependencies);
    
    // Configura verificações periódicas
    setInterval(() => {
      this.performFullCheck(dependencies);
    }, interval);
    
    console.log(`🏥 Health monitoring started (interval: ${interval/1000}s)`);
  }
}

module.exports = HealthChecker;