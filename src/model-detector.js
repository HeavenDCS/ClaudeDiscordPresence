'use strict';

/**
 * Best-effort detection of which Claude model is in use.
 *
 * IMPORTANT: the Claude Desktop App does NOT expose the selected model in any
 * stable, documented location. The only place a model ID reliably appears on
 * disk is inside Claude Code / agent-mode session files. We scan the few
 * most-recently-modified such files and take the first model ID we find —
 * nothing else. This is inherently approximate (it reflects agent sessions,
 * not necessarily the chat
 * model) and may break when the app changes its internal layout, so callers
 * MUST treat a null result as normal and fall back to the configured label.
 *
 * Privacy: we read only enough bytes to find the model identifier and never
 * store, log, or transmit any conversation content.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Matches IDs like claude-opus-4-8, claude-sonnet-4-6, claude-haiku-4-5-20251001,
// claude-fable-5. (Global so .match() returns every occurrence.)
const MODEL_RE = /claude-(?:opus|sonnet|haiku|fable)-[0-9]+(?:-[0-9]+)*/gi;

const CACHE_TTL_MS = 60 * 1000;
const MAX_READ_BYTES = 1024 * 1024; // cap how much of a session file we read
const MAX_WALK_DEPTH = 6;
const MAX_FILES_SCANNED = 12; // how many recent files to try before giving up

let cache = { at: 0, value: null };

/** The Claude Desktop App's per-OS data directory (NOT this plugin's). */
function claudeAppDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Claude');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Claude');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'Claude');
}

/** Yields .json file paths under `dir`, bounded in depth. */
function* walkJson(dir, depth) {
  if (depth < 0) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkJson(full, depth - 1);
    } else if (entry.isFile() && /\.json$/i.test(entry.name)) {
      yield full;
    }
  }
}

/** Session JSON files, newest first, capped at `limit`. */
function recentSessionFiles(limit) {
  const root = path.join(claudeAppDir(), 'claude-code-sessions');
  const files = [];
  for (const file of walkJson(root, MAX_WALK_DEPTH)) {
    try {
      files.push({ file, mtime: fs.statSync(file).mtimeMs });
    } catch (_) {
      /* ignore */
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return files.slice(0, limit).map((f) => f.file);
}

/** "claude-opus-4-8" → "Opus 4.8"; "claude-haiku-4-5-20251001" → "Haiku 4.5". */
function friendlyModel(id) {
  let m = String(id).toLowerCase().replace(/^claude-/, '').replace(/-\d{8}$/, '');
  const parts = m.split('-');
  const family = parts.shift() || '';
  const name = family.charAt(0).toUpperCase() + family.slice(1);
  const version = parts.join('.');
  return version ? `${name} ${version}` : name;
}

function readModelFrom(file) {
  try {
    const st = fs.statSync(file);
    const len = Math.min(st.size, MAX_READ_BYTES);
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, 0);
      const matches = buf.toString('utf8').match(MODEL_RE);
      if (matches && matches.length) return friendlyModel(matches[matches.length - 1]);
    } finally {
      fs.closeSync(fd);
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * Returns the best-effort friendly model name (e.g. "Opus 4.8"), or null if it
 * couldn't be determined. Result is cached for 60s so this stays cheap to call
 * on every poll.
 */
function detect() {
  const now = Date.now();
  if (now - cache.at < CACHE_TTL_MS) return cache.value;
  let value = null;
  try {
    // Newest file first (the common case), falling back to slightly older
    // sessions so one model-less file at the top doesn't blank out detection.
    for (const file of recentSessionFiles(MAX_FILES_SCANNED)) {
      value = readModelFrom(file);
      if (value) break;
    }
  } catch (_) {
    /* never let detection throw into the daemon loop */
  }
  cache = { at: now, value };
  return value;
}

module.exports = { detect, friendlyModel, claudeAppDir };
