#!/usr/bin/env node
'use strict';

/**
 * `claude-presence` — command-line entry point.
 *
 *   start [-f|--foreground] [--force]   start the background helper
 *   stop                                stop the running helper
 *   restart                             stop then start
 *   status                              show whether it's running + summary
 *   doctor                              full diagnostics with fixes
 *   install                             enable run-at-login (and start now)
 *   uninstall                           disable run-at-login
 *   config [--path]                     show config location / values
 *   help | --help | -h                  this help
 *   version | --version | -v            print the version
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const config = require('../src/config');
const single = require('../src/single-instance');
const autostart = require('../src/autostart');
const detector = require('../src/claude-detector');
const modelDetector = require('../src/model-detector');
const stats = require('../src/stats');
const paths = require('../src/paths');
const { isDiscordAvailable } = require('../src/discord-rpc');

const DAEMON = path.join(__dirname, '..', 'src', 'daemon.js');
const NODE = process.execPath;
const PKG = require('../package.json');

const OK = '✓';
const NO = '✗';
const DOT = '•';

function print(...a) { console.log(...a); }
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitUntil(fn, timeoutMs, intervalMs = 150) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await fn()) return true;
    await wait(intervalMs);
  }
  return false;
}

// ── start ─────────────────────────────────────────────────────────────────────
async function cmdStart(args) {
  const foreground = args.includes('-f') || args.includes('--foreground');
  const force = args.includes('--force');

  if (foreground) {
    // Run the daemon in THIS process (blocks). Used by `npm start` / debugging.
    return require('../src/daemon').runDaemon();
  }

  const running = single.getRunningPid();
  if (running) {
    if (!force) {
      print(`${OK} Already running (PID ${running}). Nothing to do.`);
      print(`   Use "claude-presence restart" to restart, or "--force" to replace it.`);
      return;
    }
    print(`${DOT} Stopping existing instance (PID ${running})…`);
    await cmdStop([]);
  }

  // Launch the daemon detached and windowless, then return to the shell.
  const child = spawn(NODE, [DAEMON], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  const ok = await waitUntil(() => single.getRunningPid() != null, 4000);
  const pid = single.getRunningPid();
  if (ok && pid) {
    print(`${OK} Started in the background (PID ${pid}).`);
  } else {
    print(`${NO} The helper did not report as running. Check the log:`);
    print(`   ${paths.logPath()}`);
    process.exitCode = 1;
  }

  warnIfUnconfigured();
}

// ── stop ──────────────────────────────────────────────────────────────────────
async function cmdStop() {
  const pid = single.getRunningPid();
  if (!pid) {
    print(`${DOT} Not running.`);
    return;
  }
  // On POSIX this lets the daemon run its SIGTERM handler (graceful clear).
  // On Windows there are no real signals — Node terminates the process
  // immediately, so the daemon's shutdown() never runs; that's fine because
  // Discord clears the presence on its own as soon as the IPC socket drops.
  try { process.kill(pid, 'SIGTERM'); } catch (_) {}

  const gone = await waitUntil(() => single.getRunningPid() == null, 3000);
  if (!gone) {
    // Forceful fallback.
    try { process.kill(pid, 'SIGKILL'); } catch (_) {}
    await waitUntil(() => single.getRunningPid() == null, 1500);
  }
  // Clean up a lock the killed process may have left behind.
  try {
    const lock = single.readLock();
    if (lock && lock.pid === pid) fs.unlinkSync(paths.lockPath());
  } catch (_) {}

  print(`${OK} Stopped (was PID ${pid}). Discord status cleared.`);
}

// ── restart ────────────────────────────────────────────────────────────────────
async function cmdRestart() {
  await cmdStop();
  await wait(400);
  await cmdStart([]);
}

// ── status ──────────────────────────────────────────────────────────────────────
async function cmdStatus() {
  const cfg = safeLoadConfig();
  const pid = single.getRunningPid();

  print('Claude Discord Presence — status');
  print('────────────────────────────────');
  print(`  Helper running : ${pid ? `${OK} yes (PID ${pid})` : `${NO} no`}`);
  print(`  Autostart      : ${autostart.isInstalled() ? `${OK} enabled` : `${NO} disabled`}`);
  if (cfg) {
    const configured = !!config.resolveClientId(cfg);
    print(`  Discord App ID : ${configured ? `${OK} set` : `${NO} not set (run: claude-presence setup)`}`);
    if (cfg.model && cfg.model.show) {
      const m = (cfg.model.detect && modelDetector.detect()) || cfg.model.label;
      print(`  Model shown    : ${m || '(none)'}`);
    }
    if (cfg.usage && cfg.usage.show && cfg.usage.planLabel) {
      print(`  Plan           : ${cfg.usage.planLabel}`);
    }
  }
  print(`  Used today     : ${stats.formatDuration(stats.getTodaySeconds())}`);
  print(`  Used this month: ${stats.formatDuration(stats.getMonthSeconds())}`);
  print(`  Config file    : ${paths.configPath()}`);
  if (!pid) print(`\n  Start it with: claude-presence start  (or "setup" for first-time setup)`);
}

// ── doctor ──────────────────────────────────────────────────────────────────────
async function cmdDoctor() {
  print('Claude Discord Presence — doctor');
  print('════════════════════════════════\n');

  const problems = [];

  // Node
  const major = parseInt(process.versions.node.split('.')[0], 10);
  print(`${major >= 16 ? OK : NO} Node.js ${process.versions.node}` + (major >= 16 ? '' : '  (need >= 16)'));
  if (major < 16) problems.push('Upgrade Node.js to v16 or newer.');

  print(`${DOT} Platform: ${process.platform} (${process.arch})`);
  print(`${DOT} Data dir: ${paths.dataDir()}`);
  print(`${DOT} Log file: ${paths.logPath()}`);

  // Config
  let cfg = null;
  try {
    cfg = config.load();
    print(`${OK} Config loaded: ${paths.configPath()}`);
  } catch (e) {
    print(`${NO} Config error: ${e.message}`);
    problems.push('Fix or delete config.json so it can be regenerated.');
  }

  if (cfg) {
    const effectiveId = config.resolveClientId(cfg);
    if (!effectiveId) {
      print(`${NO} Discord Application ID is not set (presence is disabled).`);
      problems.push('Run "claude-presence setup", or set "clientId" in config.json (README → Discord setup).');
    } else if (config.isClientIdPlaceholder(cfg.clientId)) {
      print(`${OK} Discord Application ID: using the built-in default.`);
    } else {
      print(`${OK} Discord Application ID is set.`);
    }
    print(`${DOT} Poll interval: ${cfg.pollIntervalSeconds}s · onClaudeClose: ${cfg.onClaudeClose} · activeWindow: ${cfg.detectActiveWindow}`);
    print(`${DOT} Watching processes: ${(cfg.claudeProcessNames || []).join(', ')}`);
  }

  // Running / autostart
  print(`${single.getRunningPid() ? OK : DOT} Helper running: ${single.getRunningPid() ? `yes (PID ${single.getRunningPid()})` : 'no'}`);
  print(`${autostart.isInstalled() ? OK : DOT} Autostart: ${autostart.isInstalled() ? `enabled (${autostart.location()})` : 'disabled'}`);

  // Discord reachable?
  const discordUp = await isDiscordAvailable(2000);
  print(`${discordUp ? OK : NO} Discord desktop ${discordUp ? 'is reachable' : 'not detected'}.`);
  if (!discordUp) problems.push('Open the Discord DESKTOP app (the browser version cannot show Rich Presence).');

  // Claude running?
  const claudeUp = cfg ? await detector.isClaudeRunning(cfg.claudeProcessNames) : false;
  print(`${claudeUp ? OK : DOT} Claude ${claudeUp ? 'is running' : 'not detected right now'}.`);
  if (!claudeUp) {
    const all = await detector.getRunningProcessNames();
    const claudeLike = [...all].filter((n) => n.includes('claude'));
    if (claudeLike.length) {
      print(`   Processes containing "claude": ${claudeLike.join(', ')}`);
      print(`   → if one of these is the app, add it to "claudeProcessNames" in config.json.`);
    } else {
      print(`   (Open Claude, then run "claude-presence doctor" again to confirm detection.)`);
    }
  }

  // Foreground (only if enabled)
  if (cfg && cfg.detectActiveWindow) {
    const fg = await detector.getForegroundProcessName();
    print(`${DOT} Foreground window process: ${fg || 'unknown'}`);
  }

  // Model display
  if (cfg && cfg.model && cfg.model.show) {
    const detected = cfg.model.detect ? modelDetector.detect() : null;
    const suffix = cfg.model.detect
      ? (detected ? ' (auto-detected)' : ' (label — auto-detect found nothing)')
      : ' (label)';
    print(`${DOT} Model shown: ${detected || cfg.model.label}${suffix}`);
  }

  print('');
  if (problems.length === 0) {
    print(`${OK} Everything looks good. Run "claude-presence start" (or "install" for autostart).`);
  } else {
    print('Action items:');
    problems.forEach((p, i) => print(`  ${i + 1}. ${p}`));
  }
}

// ── install / uninstall ──────────────────────────────────────────────────────────
async function cmdInstall() {
  const loc = await autostart.install();
  print(`${OK} Autostart enabled. The helper will launch automatically at login.`);
  print(`   ${loc}`);
  if (!single.getRunningPid()) {
    await cmdStart([]);
  } else {
    print(`${DOT} Helper already running (PID ${single.getRunningPid()}).`);
  }
}
async function cmdUninstall() {
  const loc = await autostart.uninstall();
  print(`${OK} Autostart disabled.`);
  print(`   Removed: ${loc}`);
  print(`   (The currently-running helper, if any, keeps running. Use "stop" to end it.)`);
}

// ── setup (interactive wizard) ────────────────────────────────────────────────
function ask(rl, question, def) {
  const suffix = def ? ` [${def}]` : '';
  return new Promise((resolve) =>
    rl.question(`${question}${suffix}: `, (a) => resolve((a || '').trim() || def || ''))
  );
}
async function askYesNo(rl, question, def) {
  const a = await ask(rl, `${question} (y/n)`, def ? 'y' : 'n');
  return /^y/i.test(a);
}

async function cmdSetup() {
  const cfg = config.load();
  cfg.model = cfg.model || {};
  cfg.usage = cfg.usage || {};

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  print('\nClaude Discord Presence — setup');
  print('───────────────────────────────\n');
  try {
    // 1) Discord Application ID
    if (!config.isClientIdPlaceholder(config.DEFAULT_CLIENT_ID)) {
      print('A built-in Discord Application ID is available — press Enter to use it.');
    } else {
      print('You need a Discord Application ID (free, ~2 min):');
      print('  1. Open https://discord.com/developers/applications → New Application');
      print('  2. Name it "Claude", then copy its Application ID (a long number).');
      print('  (The full walkthrough, including the logo, is in the README.)\n');
    }
    const currentId = config.isClientIdPlaceholder(cfg.clientId) ? '' : cfg.clientId;
    const id = await ask(rl, 'Discord Application ID', currentId);
    if (/^\d{15,25}$/.test(id)) cfg.clientId = id;
    else if (id) print(`  ("${id}" isn't a valid ID — leaving the current value unchanged.)`);

    // 2) Model line
    cfg.model.show = await askYesNo(rl, '\nShow which model you use?', cfg.model.show !== false);
    if (cfg.model.show) {
      cfg.model.label = await ask(rl, '  Model label', cfg.model.label || 'Opus 4.8');
      cfg.model.detect = await askYesNo(rl, '  Also try best-effort auto-detection?', cfg.model.detect !== false);
    }

    // 3) Plan + usage
    cfg.usage.show = await askYesNo(rl, '\nShow your plan name + time used?', cfg.usage.show !== false);
    if (cfg.usage.show) {
      cfg.usage.planLabel = await ask(rl, '  Plan label (e.g. Claude Pro, Claude Max)', cfg.usage.planLabel || 'Claude');
      cfg.usage.showMonth = await askYesNo(rl, '  Include this-month total?', cfg.usage.showMonth !== false);
    }

    // 4) Autostart / start
    const autostartChoice = await askYesNo(rl, '\nLaunch automatically at login?', true);
    const startNow = autostartChoice ? true : await askYesNo(rl, 'Start the helper now?', true);

    config.save(cfg);
    print(`\n${OK} Saved ${paths.configPath()}`);
    rl.close();

    if (autostartChoice) await cmdInstall();
    else if (startNow) await cmdStart([]);
    else print(`\nWhen you're ready:  claude-presence start`);

    if (config.resolveClientId(cfg)) {
      print(`\n${OK} All set — open Claude and check your Discord profile! ("doctor" diagnoses issues.)`);
    } else {
      print(`\n${NO} No valid Application ID yet, so presence stays off until one is set.`);
    }
  } finally {
    try { rl.close(); } catch (_) {}
  }
}

// ── config ──────────────────────────────────────────────────────────────────────
async function cmdConfig(args) {
  if (args.includes('--path')) {
    print(paths.configPath());
    return;
  }
  const cfg = safeLoadConfig();
  print(`Config file: ${paths.configPath()}\n`);
  if (cfg) print(JSON.stringify(cfg, null, 2));
}

// ── helpers ───────────────────────────────────────────────────────────────────
function safeLoadConfig() {
  try { return config.load(); }
  catch (e) { print(`${NO} ${e.message}`); return null; }
}
function warnIfUnconfigured() {
  const cfg = safeLoadConfig();
  if (cfg && !config.resolveClientId(cfg)) {
    print('');
    print(`${NO} Heads up: no Discord Application ID is set yet, so nothing will show.`);
    print(`   Easiest fix →  claude-presence setup`);
    print(`   Or create an app at https://discord.com/developers/applications and put`);
    print(`   its Application ID in: ${paths.configPath()}`);
  }
}

function help() {
  print(`claude-presence v${PKG.version} — Discord Rich Presence for the Claude Desktop App
Usage: claude-presence <command> [options]

Commands:
  setup                            Interactive first-time setup (recommended)
  start [--foreground] [--force]   Start the background helper
                                     --foreground (-f)  run in this terminal (don't detach)
                                     --force            replace an already-running instance
  stop                             Stop the running helper (clears your Discord status)
  restart                          Restart the helper
  status                           Show whether it's running, plus a quick summary
  doctor                           Run full diagnostics and suggest fixes
  install                          Enable run-at-login, then start the helper now
  uninstall                        Disable run-at-login
  config [--path]                  Print the config (or just its file path)
  help                             Show this help
  version                          Print the version

First time? Run:  claude-presence setup`);
}

// ── dispatch ──────────────────────────────────────────────────────────────────
async function main() {
  const [, , cmd, ...args] = process.argv;
  switch (cmd) {
    case 'setup': return cmdSetup(args);
    case 'start': return cmdStart(args);
    case 'stop': return cmdStop(args);
    case 'restart': return cmdRestart(args);
    case 'status': return cmdStatus(args);
    case 'doctor': return cmdDoctor(args);
    case 'install': return cmdInstall(args);
    case 'uninstall': return cmdUninstall(args);
    case 'config': return cmdConfig(args);
    case 'version': case '--version': case '-v': return print(PKG.version);
    case 'help': case '--help': case '-h': case undefined: return help();
    default:
      print(`Unknown command: ${cmd}\n`);
      help();
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
