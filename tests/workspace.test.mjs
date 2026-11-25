import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const text = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('checkout includes a locked pnpm workspace and the three acceptance entry points', () => {
  assert.match(text('pnpm-lock.yaml'), /^lockfileVersion:/m);
  assert.match(text('pnpm-workspace.yaml'), /^packages:/m);
  assert.ok(text('.gitignore').trim());
  const { scripts } = JSON.parse(text('package.json'));
  for (const name of ['build', 'test', 'test:e2e']) {
    assert.equal(typeof scripts[name], 'string', `missing root script ${name}`);
    assert.ok(scripts[name].trim(), `empty root script ${name}`);
  }
});
