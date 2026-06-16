'use strict';

/**
 * Turns the current detection state + user config into a Discord "activity"
 * object (or null to clear). Pure and side-effect-free apart from reading
 * today's usage total for the tooltip.
 */

const stats = require('./stats');

/** Clamp a string to Discord's limits (min 2 chars, configurable max). */
function clampStr(value, max) {
  if (value == null) return undefined;
  let s = String(value);
  if (s.length < 2) s = (s + '  ').slice(0, 2); // Discord rejects <2 chars
  if (s.length > max) s = s.slice(0, max - 1) + '…';
  return s;
}

/**
 * @param {object} state  { running, active, sessionStart, rotationIndex }
 * @param {object} cfg    full config object
 * @returns {object|null} a Discord activity payload, or null to clear
 */
function build(state, cfg) {
  if (!state.running) return null;

  const p = cfg.presence || {};
  const active = state.active !== false; // null/undefined → treat as active

  // Top line: rotate through messages if any are configured.
  let details = p.details;
  const msgs = Array.isArray(p.rotateMessages) ? p.rotateMessages.filter(Boolean) : [];
  if (msgs.length > 0) {
    const i = ((state.rotationIndex % msgs.length) + msgs.length) % msgs.length;
    details = msgs[i];
  }

  // Second line: the model, then either the live status or — when usage.showOnCard
  // is enabled — your plan label, so the plan is visible without hovering the icon.
  const usage = cfg.usage || {};
  let statusText = active ? p.stateActive : p.stateIdle;
  if (usage.show && usage.showOnCard && usage.planLabel) {
    statusText = usage.planLabel;
  }
  const model = cfg.model || {};
  if (model.show) {
    const modelName = state.model || model.label;
    if (modelName) statusText = `${modelName} · ${statusText}`;
  }

  // Logo tooltip: plan name + locally-measured usage time (never a $ figure).
  let largeText = p.largeText || 'Claude';
  if (usage.show) {
    const parts = [];
    if (usage.planLabel) parts.push(usage.planLabel);
    if (usage.showToday) parts.push(`${stats.formatDuration(stats.getTodaySeconds())} today`);
    if (usage.showMonth) parts.push(`${stats.formatDuration(stats.getMonthSeconds())} this month`);
    if (parts.length) largeText = parts.join(' · ');
  }

  const activity = {
    details: clampStr(details, 128),
    state: clampStr(statusText, 128),
    assets: {
      large_image: p.largeImage || undefined,
      large_text: clampStr(largeText, 128),
      small_image: (active ? p.smallImageActive : p.smallImageIdle) || undefined,
      small_text: clampStr(active ? p.smallTextActive : p.smallTextIdle, 128),
    },
  };

  if (typeof p.activeType === 'number') activity.type = p.activeType;

  if (cfg.showTimer && state.sessionStart) {
    activity.timestamps = { start: Math.floor(state.sessionStart / 1000) };
  }

  const buttons = (Array.isArray(p.buttons) ? p.buttons : [])
    .filter((b) => b && b.label && /^https?:\/\//i.test(b.url))
    .slice(0, 2)
    .map((b) => ({ label: clampStr(b.label, 31), url: b.url }));
  if (buttons.length) activity.buttons = buttons;

  return activity;
}

/**
 * A stable, timestamp-independent fingerprint of an activity. The daemon only
 * pushes an update to Discord when this changes, keeping us well under the
 * rate limit (the elapsed timer keeps ticking on Discord's side regardless).
 */
function signature(activity) {
  if (!activity) return 'null';
  const copy = JSON.parse(JSON.stringify(activity));
  delete copy.timestamps;
  return JSON.stringify(copy);
}

module.exports = { build, signature, clampStr };
