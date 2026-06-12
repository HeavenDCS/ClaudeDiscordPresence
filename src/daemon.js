'use strict';

/**
 * The long-lived background helper. Acquires the single-instance lock, then
 * polls for Claude and drives the Discord presence. Designed to run detached
 * and windowless; everything interesting goes to the log file.
 *
 * Run directly (`node src/daemon.js`) or via the CLI (`claude-presence start`).
 */

const config = require('./config');
const logger = require('./logger');
const single = require('./single-instance');
const stats = require('./stats');
const detector = require('./claude-detector');
const modelDetector = require('./model-detector');
const presence = require('./presence-builder');
const { DiscordRPC } = require('./discord-rpc');

async function runDaemon() {
  const cfg = config.load();
  logger.setLevel(cfg.logLevel || 'info');

  // ── Single-instance guard ───────────────────────────────────────────────
  const lock = single.acquire();
  if (!lock.acquired) {
    logger.warn(`Another instance is already running (PID ${lock.pid}). Exiting.`);
    process.exitCode = 0;
    return;
  }
  if (lock.replacedStale) logger.info('Replaced a stale lock from a previous crash.');
  logger.info(`Claude Discord Presence started (PID ${process.pid}).`);

  const clientId = config.resolveClientId(cfg);
  const clientReady = !!clientId;
  if (!clientReady) {
    logger.warn('No valid Discord Application ID set — presence is disabled.');
    logger.warn(`Run "claude-presence setup", or set "clientId" in ${config.configPath()}.`);
  }

  // ── State ────────────────────────────────────────────────────────────────
  let sessionStart = null; // when the current Claude session began (ms)
  let lastSignature = null; // last activity we pushed (to avoid spam)
  let stopped = false;

  const pollMs = Math.max(5, cfg.pollIntervalSeconds || 15) * 1000;
  const rotateSec = Math.max(10, (cfg.presence && cfg.presence.rotateIntervalSeconds) || 30);

  // ── Discord client ────────────────────────────────────────────────────────
  const rpc = new DiscordRPC(clientId, logger);
  rpc.on('connected', (user) => {
    logger.info('Connected to Discord' + (user && user.username ? ` as ${user.username}` : '') + '.');
    lastSignature = null; // force a fresh push now that we're connected
    tick();
  });
  rpc.on('disconnected', () => {
    logger.warn('Lost the Discord connection; will retry automatically.');
    lastSignature = null;
  });
  rpc.on('rpc-error', (e) => {
    logger.warn('Discord rejected the presence: ' + (e && e.message) +
      ' — check your clientId and that asset keys exist in the Developer Portal.');
  });
  if (clientReady) rpc.start();

  // ── Poll loop ──────────────────────────────────────────────────────────────
  async function tick() {
    if (stopped) return;
    try {
      const running = await detector.isClaudeRunning(cfg.claudeProcessNames);

      let active = true;
      if (running && cfg.detectActiveWindow) {
        const a = await detector.isClaudeActive(cfg.claudeProcessNames);
        if (a !== null) active = a;
      }

      if (running) {
        if (!sessionStart) {
          sessionStart = Date.now();
          logger.info('Claude detected — session started.');
        }
        stats.addSeconds(Math.round(pollMs / 1000));
      } else if (sessionStart) {
        sessionStart = null;
        logger.info('Claude closed.');
      }

      // Claude not running → hide presence (and maybe shut down).
      if (!running) {
        if (lastSignature !== 'null') {
          rpc.clearActivity();
          lastSignature = 'null';
        }
        if (cfg.onClaudeClose === 'exit') {
          logger.info('onClaudeClose=exit — shutting the helper down.');
          shutdown(0);
        }
        return;
      }

      // Resolve which model to show: configured label, optionally overridden
      // by best-effort detection (falls back to the label if detection is blank).
      let modelText = null;
      if (cfg.model && cfg.model.show) {
        modelText = cfg.model.label || null;
        if (cfg.model.detect) {
          const detected = modelDetector.detect();
          if (detected) modelText = detected;
        }
      }

      // Claude running → build and (conditionally) push the activity.
      const rotationIndex = Math.floor(Date.now() / 1000 / rotateSec);
      const activity = presence.build({ running, active, sessionStart, rotationIndex, model: modelText }, cfg);
      const sig = presence.signature(activity);
      if (rpc.connected && sig !== lastSignature) {
        rpc.setActivity(activity);
        lastSignature = sig;
        logger.debug('Presence updated.');
      }
    } catch (e) {
      logger.error('Poll error:', e);
    }
  }

  const interval = setInterval(tick, pollMs);
  tick(); // run immediately so we don't wait a full interval at startup

  // ── Shutdown ───────────────────────────────────────────────────────────────
  function shutdown(code) {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    try { rpc.clearActivity(); } catch (_) {}
    // Give the clear frame a moment to flush before we tear down the socket.
    setTimeout(() => {
      try { rpc.destroy(); } catch (_) {}
      single.release();
      logger.info('Stopped.');
      process.exit(code || 0);
    }, 300);
  }

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  process.on('SIGHUP', () => shutdown(0));
  process.on('uncaughtException', (e) => {
    logger.error('Uncaught exception:', e);
    shutdown(1);
  });
  // Last-ditch lock cleanup if the process exits some other way.
  process.on('exit', () => single.release());
}

if (require.main === module) {
  runDaemon().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runDaemon };
