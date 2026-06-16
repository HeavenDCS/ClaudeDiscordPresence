'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const presence = require('../src/presence-builder');

// usage.show=false keeps build() pure (it never reads stats.json from disk).
const baseCfg = {
  showTimer: true,
  model: { show: false },
  usage: { show: false },
  presence: {
    activeType: 0,
    largeImage: 'claude_logo',
    largeText: 'Claude',
    smallImageActive: 'active',
    smallImageIdle: 'idle',
    smallTextActive: 'Active',
    smallTextIdle: 'Idle',
    details: 'Top line',
    stateActive: 'Active state',
    stateIdle: 'Idle state',
    rotateMessages: [],
    buttons: [],
  },
};

test('build returns null when Claude is not running', () => {
  assert.strictEqual(presence.build({ running: false }, baseCfg), null);
});

test('build sets details, state, type and the timer', () => {
  const a = presence.build({ running: true, active: true, sessionStart: 1700000000000 }, baseCfg);
  assert.strictEqual(a.details, 'Top line');
  assert.strictEqual(a.state, 'Active state');
  assert.strictEqual(a.type, 0);
  assert.strictEqual(a.timestamps.start, Math.floor(1700000000000 / 1000));
});

test('build uses the idle state line when inactive', () => {
  const a = presence.build({ running: true, active: false, sessionStart: 0 }, baseCfg);
  assert.strictEqual(a.state, 'Idle state');
});

test('build prefixes the model when model.show and a model is given', () => {
  const cfg = { ...baseCfg, model: { show: true, label: 'Opus 4.8' } };
  const a = presence.build({ running: true, active: true, model: 'Opus 4.8' }, cfg);
  assert.strictEqual(a.state, 'Opus 4.8 · Active state');
});

test('build puts the plan on the 2nd line when usage.showOnCard is set', () => {
  const cfg = {
    ...baseCfg,
    model: { show: true, label: 'Opus 4.8' },
    usage: { show: true, showOnCard: true, planLabel: 'Claude Max' },
  };
  const a = presence.build({ running: true, active: true, model: 'Opus 4.8' }, cfg);
  assert.strictEqual(a.state, 'Opus 4.8 · Claude Max');
});

test('build keeps the status line when showOnCard is off', () => {
  const cfg = {
    ...baseCfg,
    model: { show: false },
    usage: { show: true, showOnCard: false, planLabel: 'Claude Max' },
  };
  const a = presence.build({ running: true, active: true }, cfg);
  assert.strictEqual(a.state, 'Active state');
});

test('build rotates the top line through rotateMessages', () => {
  const cfg = { ...baseCfg, presence: { ...baseCfg.presence, rotateMessages: ['Alpha', 'Bravo', 'Charlie'] } };
  assert.strictEqual(presence.build({ running: true, rotationIndex: 0 }, cfg).details, 'Alpha');
  assert.strictEqual(presence.build({ running: true, rotationIndex: 4 }, cfg).details, 'Bravo');
});

test('build keeps only valid http(s) buttons, capped at two', () => {
  const cfg = {
    ...baseCfg,
    presence: {
      ...baseCfg.presence,
      buttons: [
        { label: 'ok', url: 'https://a.com' },
        { label: 'bad', url: 'ftp://x' },
        { label: 'ok2', url: 'http://b.com' },
        { label: 'third', url: 'https://c.com' },
      ],
    },
  };
  const a = presence.build({ running: true, active: true }, cfg);
  assert.strictEqual(a.buttons.length, 2);
  assert.strictEqual(a.buttons[0].label, 'ok');
  assert.strictEqual(a.buttons[1].url, 'http://b.com');
});

test('clampStr pads short strings and truncates long ones with an ellipsis', () => {
  assert.strictEqual(presence.clampStr('x', 128), 'x ');
  assert.strictEqual(presence.clampStr(undefined, 128), undefined);
  const out = presence.clampStr('a'.repeat(200), 10);
  assert.strictEqual(out.length, 10);
  assert.ok(out.endsWith('…'));
});

test('signature is stable across timestamp changes and "null" for cleared', () => {
  const a = presence.build({ running: true, active: true, sessionStart: 1 }, baseCfg);
  const b = presence.build({ running: true, active: true, sessionStart: 999999 }, baseCfg);
  assert.strictEqual(presence.signature(a), presence.signature(b));
  assert.strictEqual(presence.signature(null), 'null');
});
