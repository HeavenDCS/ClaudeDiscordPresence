'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { norm } = require('../src/claude-detector');
const { friendlyModel } = require('../src/model-detector');
const { ipcCandidates } = require('../src/discord-rpc');

test('norm lowercases, trims and strips a trailing .exe', () => {
  assert.strictEqual(norm('  Claude.exe '), 'claude');
  assert.strictEqual(norm('Claude'), 'claude');
  assert.strictEqual(norm('CLAUDE.EXE'), 'claude');
  assert.strictEqual(norm(null), '');
});

test('friendlyModel turns model ids into display names', () => {
  assert.strictEqual(friendlyModel('claude-opus-4-8'), 'Opus 4.8');
  assert.strictEqual(friendlyModel('claude-sonnet-4-6'), 'Sonnet 4.6');
  assert.strictEqual(friendlyModel('claude-haiku-4-5-20251001'), 'Haiku 4.5');
  assert.strictEqual(friendlyModel('claude-fable-5'), 'Fable 5');
});

test('ipcCandidates returns non-empty, platform-appropriate socket paths', () => {
  const list = ipcCandidates();
  assert.ok(Array.isArray(list) && list.length > 0);
  assert.ok(list.every((p) => p.includes('discord-ipc-')));
});
