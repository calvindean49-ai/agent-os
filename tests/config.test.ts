import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { loadConfig } from '../runner/config.ts';
import { tmp } from './helpers.ts';

test('loadConfig accepts the null Brain written by config:init', () => {
  const root = tmp('config-');
  mkdirSync(join(root, '.agent-os'));
  writeFileSync(join(root, '.agent-os', 'config.json'), JSON.stringify({ brain: null, repos: {} }));
  const config = loadConfig(root);
  assert.equal(config.brain, null);
  assert.deepEqual(config.codexTrusted, []);
});

test('loadConfig keeps only absolute trusted checkout paths', () => {
  const root = tmp('config-');
  mkdirSync(join(root, '.agent-os'));
  writeFileSync(join(root, '.agent-os', 'config.json'), JSON.stringify({ brain: null, repos: {}, codexTrusted: ['/repo', 'relative'] }));
  assert.deepEqual(loadConfig(root).codexTrusted, ['/repo']);
});
