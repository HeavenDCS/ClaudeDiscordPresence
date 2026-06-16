'use strict';

/**
 * Local-only daily usage tracking. Stores a simple map of
 * { "YYYY-MM-DD": secondsClaudeWasOpen } in stats.json. Used to show
 * "• 1h 23m today" in the presence tooltip. This data NEVER leaves the
 * machine and old entries are pruned automatically.
 */

const fs = require('fs');
const { statsPath, ensureDataDir } = require('./paths');
const { writeFileAtomic } = require('./fs-utils');

const RETENTION_MS = 60 * 24 * 3600 * 1000; // keep ~60 days

/** Local date key, e.g. "2026-06-12". */
function today() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function loadAll() {
  try {
    return JSON.parse(fs.readFileSync(statsPath(), 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function saveAll(data) {
  try {
    ensureDataDir();
    // Atomic write: a crash mid-save can never truncate stats.json (which
    // loadAll would then read as {} — silently wiping all usage history).
    writeFileAtomic(statsPath(), JSON.stringify(data));
  } catch (_) {
    /* stats are best-effort; never crash the daemon over them */
  }
}

/** Adds `seconds` to today's total and returns the new total. */
function addSeconds(seconds) {
  const data = loadAll();
  const key = today();
  data[key] = (data[key] || 0) + Math.max(0, seconds);

  const cutoff = Date.now() - RETENTION_MS;
  for (const k of Object.keys(data)) {
    const t = Date.parse(k);
    if (!Number.isNaN(t) && t < cutoff) delete data[k];
  }

  saveAll(data);
  return data[key];
}

function getTodaySeconds() {
  return loadAll()[today()] || 0;
}

/** Total seconds recorded so far this calendar month. */
function getMonthSeconds() {
  const prefix = today().slice(0, 7); // "YYYY-MM"
  const data = loadAll();
  let total = 0;
  for (const key of Object.keys(data)) {
    if (key.startsWith(prefix)) total += data[key] || 0;
  }
  return total;
}

/** Formats seconds as a compact human string: "1h 23m", "45m", "12s". */
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

module.exports = { addSeconds, getTodaySeconds, getMonthSeconds, formatDuration, today };
