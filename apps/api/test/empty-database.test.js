import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

// D1 migrations must not depend on tables left behind by local development.
test('all D1 migrations compose on a blank SQLite database with foreign keys enabled', () => {
  const dir = new URL('../migrations/', import.meta.url);
  const migrations = readdirSync(dir).filter(name => name.endsWith('.sql')).sort();
  assert.ok(migrations.length > 0);
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const name of migrations) db.exec(readFileSync(new URL(name, dir), 'utf8'));
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally {
    db.close();
  }
});
