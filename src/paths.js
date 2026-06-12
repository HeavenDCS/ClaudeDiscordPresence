'use strict';

/**
 * Resolves all on-disk locations the helper uses, in the correct per-OS
 * application-data directory. Everything the daemon writes (config, lock,
 * logs, stats) lives under a single folder so it is easy to find and remove.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

const APP_DIR_NAME = 'claude-discord-presence';

/** Absolute path to the per-user data directory for this app. */
function dataDir() {
  const platform = process.platform;
  let base;
  if (platform === 'win32') {
    base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  } else if (platform === 'darwin') {
    base = path.join(os.homedir(), 'Library', 'Application Support');
  } else {
    base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  }
  return path.join(base, APP_DIR_NAME);
}

/** Creates the data directory if needed and returns its path. */
function ensureDataDir() {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  APP_DIR_NAME,
  dataDir,
  ensureDataDir,
  configPath: () => path.join(dataDir(), 'config.json'),
  lockPath: () => path.join(dataDir(), 'presence.lock'),
  logPath: () => path.join(dataDir(), 'presence.log'),
  statsPath: () => path.join(dataDir(), 'stats.json'),
  foregroundScriptPath: () => path.join(dataDir(), 'fg-detect.ps1'),
};
