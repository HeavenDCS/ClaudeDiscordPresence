'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const stats = require('../src/stats');

test('formatDuration formats hours, minutes and seconds', () => {
  assert.strictEqual(stats.formatDuration(0), '0s');
  assert.strictEqual(stats.formatDuration(12), '12s');
  assert.strictEqual(stats.formatDuration(60), '1m');
  assert.strictEqual(stats.formatDuration(83 * 60), '1h 23m');
  assert.strictEqual(stats.formatDuration(3600), '1h 0m');
});

test('formatDuration clamps negatives and floors fractions', () => {
  assert.strictEqual(stats.formatDuration(-5), '0s');
  assert.strictEqual(stats.formatDuration(59.9), '59s');
});

test('today returns a YYYY-MM-DD key', () => {
  assert.match(stats.today(), /^\d{4}-\d{2}-\d{2}$/);
});
