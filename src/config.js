'use strict';

/**
 * Configuration loading/saving with sane defaults.
 *
 * On first run a `config.json` is written to the data directory from
 * DEFAULT_CONFIG. On every load the user's file is deep-merged over the
 * defaults, so upgrading the plugin (which may add new keys) never requires
 * the user to hand-edit their config — missing keys are filled in.
 */

const fs = require('fs');
const { configPath, ensureDataDir } = require('./paths');

// ════════════════════════════════════════════════════════════════════════════
// ► THE ONE-TIME SETUP SWITCH ◄
// Paste a shared Discord Application ID between the quotes below and commit it.
// Once it's set, EVERYONE who installs this build gets working Rich Presence
// with ZERO setup — no Developer Portal, no copying IDs, no per-user config.
//
// To create it (about 2 minutes, done ONCE by you — not by your users):
//   1. https://discord.com/developers/applications → New Application, name it
//      "Claude" (this becomes the "Playing Claude" label).
//   2. Copy its Application ID (the long number) and paste it below.
//   3. Rich Presence → Art Assets → upload the large icon as key `claude_logo`
//      (optional: `active` / `idle` overlays). Uploaded once here, it shows for
//      every installer — they never touch Discord.
//
// Leave it empty and the app still works, falling back to a per-user ID that
// each person supplies via `claude-presence setup` or their config file.
// ════════════════════════════════════════════════════════════════════════════
const DEFAULT_CLIENT_ID = '1515659802209026170';

const DEFAULT_CONFIG = {
  // ── Discord ───────────────────────────────────────────────────────────
  // Leave empty to use the shared Discord app baked into this build
  // (DEFAULT_CLIENT_ID above) — that's the zero-setup default, and what most
  // users should keep. Only set this to override with your OWN Discord
  // Application ID. See the README.
  clientId: '',

  // ── Detection ─────────────────────────────────────────────────────────
  pollIntervalSeconds: 15, // how often to check whether Claude is running
  claudeProcessNames: ['Claude.exe', 'Claude'], // matched case-insensitively
  detectActiveWindow: false, // if true, distinguish "active" (focused) vs "idle"

  // ── Behaviour ─────────────────────────────────────────────────────────
  // 'clear' = keep the helper running and just hide the presence when Claude
  //           closes (re-shows on reopen). 'exit' = shut the helper down.
  onClaudeClose: 'clear',

  logLevel: 'info', // error | warn | info | debug
  showTimer: true, // show the elapsed-since-opened timer

  // Which model you're using. The Claude app doesn't reliably expose this, so
  // the label is the dependable source; `detect` is best-effort and may be blank.
  model: {
    show: true,
    label: 'Opus 4.8', // shown like "Opus 4.8 · Actively in a conversation"
    detect: true, // best-effort auto-detection from local Claude session files
  },

  // The desktop app is a flat subscription (no per-message $), so instead of a
  // misleading dollar figure we show your plan name + real, locally-measured time.
  usage: {
    show: true,
    planLabel: 'Claude', // e.g. "Claude", "Claude Pro", "Claude Max"
    showToday: true,
    showMonth: true,
  },

  // ── Presence appearance ───────────────────────────────────────────────
  presence: {
    // Discord activity type: 0 Playing · 2 Listening · 3 Watching · 5 Competing
    activeType: 0,

    // Each image is EITHER an art-asset key uploaded to your Discord app
    // (Developer Portal → Rich Presence → Art Assets) OR a full https URL to a
    // hosted PNG/JPG (no upload needed — Discord proxies it). See the README.
    largeImage: 'claude_logo',
    largeText: 'Claude',
    smallImageActive: 'active',
    smallImageIdle: 'idle',
    smallTextActive: 'Active',
    smallTextIdle: 'Idle',

    // Text lines. `details` is the top line; `state` is the second line.
    details: 'Chatting with Claude',
    stateActive: 'Actively in a conversation',
    stateIdle: 'Claude is open',

    // If non-empty, the top line rotates through these over time.
    rotateMessages: [
      'Asking Claude the big questions',
      'Pair-programming with Claude',
      'Brainstorming with Claude',
      'Refactoring with a friend',
    ],
    rotateIntervalSeconds: 30,

    // Up to 2 buttons (Discord limit). URLs must be http(s).
    buttons: [
      { label: 'Try Claude', url: 'https://claude.ai' },
      { label: 'Get this plugin', url: 'https://github.com/HeavenDCS/claude-discord-presence' },
    ],
  },
};

/** Recursively merges `override` onto `base` (arrays are replaced wholesale). */
function deepMerge(base, override) {
  if (override === undefined) return base;
  if (Array.isArray(base) || Array.isArray(override)) {
    return Array.isArray(override) ? override : base;
  }
  if (base && typeof base === 'object' && override && typeof override === 'object') {
    const out = { ...base };
    for (const key of Object.keys(override)) {
      out[key] = deepMerge(base[key], override[key]);
    }
    return out;
  }
  return override;
}

/** Loads config, creating it from defaults on first run. Throws on invalid JSON. */
function load() {
  ensureDataDir();
  const p = configPath();
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
  let user;
  try {
    user = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`config.json is not valid JSON (${p}): ${e.message}`);
  }
  return deepMerge(DEFAULT_CONFIG, user || {});
}

function save(cfg) {
  ensureDataDir();
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

/** True when the given value is not a usable Discord Application ID (digits only). */
function isClientIdPlaceholder(clientId) {
  return !clientId || !/^\d{15,25}$/.test(String(clientId));
}

/**
 * The Discord Application ID actually used at runtime: the user's config value
 * if valid; otherwise the baked-in DEFAULT_CLIENT_ID (for zero-setup forks);
 * otherwise null (presence stays disabled until one is provided).
 */
function resolveClientId(cfg) {
  const raw = cfg && cfg.clientId;
  if (!isClientIdPlaceholder(raw)) return String(raw);
  if (!isClientIdPlaceholder(DEFAULT_CLIENT_ID)) return String(DEFAULT_CLIENT_ID);
  return null;
}

module.exports = {
  DEFAULT_CONFIG,
  DEFAULT_CLIENT_ID,
  load,
  save,
  deepMerge,
  isClientIdPlaceholder,
  resolveClientId,
  configPath,
};
