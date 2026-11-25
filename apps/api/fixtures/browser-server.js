// Playwright-only server: bind to loopback and provision fresh local storage.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'order-room-e2e-'));
let mf;
try {
  const require = createRequire(import.meta.url);
  const bin = join(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js');
  execFileSync(process.execPath, [bin, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', directory], {
    cwd: root, env: { ...process.env, CI: 'true' }, stdio: 'inherit',
  });
  const modules = ['fixtures/management-worker.js', ...(await readdir(join(root, 'src')))
    .filter(file => file.endsWith('.js')).map(file => `src/${file}`)];
  mf = new Miniflare(convertV4MiniflareOptions({
    host: '127.0.0.1', port: 8791, modulesRoot: root,
    modules: modules.map(file => ({ type: 'ESModule', path: join(root, file) })),
    compatibilityDate: '2026-04-01', d1Databases: { DB: '00000000-0000-0000-0000-000000000000' },
    resourcePersistencePath: join(directory, 'v3'), r2Buckets: { COVERS: 'order-room-covers' },
    bindings: { WEB_ORIGIN: 'http://127.0.0.1:4173' },
  }));
  await mf.ready;
  await new Promise(resolve => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
} finally {
  try { await mf?.dispose(); } finally { await rm(directory, { recursive: true, force: true }); }
}
