#!/usr/bin/env node
/**
 * Project-local PostgreSQL helper for Windows/macOS/Linux development without Docker.
 *
 * Creates an isolated cluster (outside OneDrive/iCloud-synced folders) on its own port,
 * so it never touches any PostgreSQL server you already run.
 *
 *   node scripts/dev-db.mjs init     # initdb + create fitclub & fitclub_test databases
 *   node scripts/dev-db.mjs start
 *   node scripts/dev-db.mjs stop
 *   node scripts/dev-db.mjs status
 *
 * Env overrides: PG_BIN (dir with pg_ctl/initdb), FITCLUB_PGDATA, FITCLUB_PGPORT,
 * FITCLUB_PGUSER, FITCLUB_PGPASSWORD.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const isWin = process.platform === 'win32';
const exe = (name) => (isWin ? `${name}.exe` : name);

function findPgBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  const candidates = [];
  if (isWin) {
    const base = 'C:\\Program Files\\PostgreSQL';
    if (existsSync(base)) {
      for (const v of readdirSync(base).sort((a, b) => Number(b) - Number(a))) {
        candidates.push(join(base, v, 'bin'));
      }
    }
  } else {
    candidates.push(
      '/usr/lib/postgresql/17/bin',
      '/usr/lib/postgresql/16/bin',
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
    );
  }
  const found = candidates.find((dir) => existsSync(join(dir, exe('pg_ctl'))));
  if (!found) {
    console.error('Could not find PostgreSQL binaries. Install PostgreSQL 15+ or set PG_BIN.');
    process.exit(1);
  }
  return found;
}

const bin = findPgBin();
const dataDir =
  process.env.FITCLUB_PGDATA ||
  join(isWin ? process.env.LOCALAPPDATA || tmpdir() : join(homedir(), '.local', 'share'), 'fitclub', 'pgdata');
const port = process.env.FITCLUB_PGPORT || '54329';
const user = process.env.FITCLUB_PGUSER || 'fitclub';
const password = process.env.FITCLUB_PGPASSWORD || 'fitclub_dev';
const logFile = join(dataDir, '..', 'postgres.log');

const run = (cmd, args, opts = {}) => execFileSync(join(bin, exe(cmd)), args, { stdio: 'inherit', ...opts });

function isRunning() {
  const r = spawnSync(join(bin, exe('pg_ctl')), ['status', '-D', dataDir], { encoding: 'utf8' });
  return r.status === 0;
}

function init() {
  if (existsSync(join(dataDir, 'PG_VERSION'))) {
    console.log(`Cluster already initialised at ${dataDir}`);
  } else {
    mkdirSync(dataDir, { recursive: true });
    const pwFile = join(tmpdir(), `fitclub-pw-${process.pid}`);
    writeFileSync(pwFile, password);
    try {
      run('initdb', [
        '-D',
        dataDir,
        '-U',
        user,
        `--pwfile=${pwFile}`,
        '--auth=scram-sha-256',
        '-E',
        'UTF8',
        '--locale=C',
      ]);
    } finally {
      rmSync(pwFile, { force: true });
    }
  }
  start();
  const env = { ...process.env, PGPASSWORD: password };
  for (const db of ['fitclub', 'fitclub_test']) {
    const r = spawnSync(join(bin, exe('createdb')), ['-h', '127.0.0.1', '-p', port, '-U', user, db], {
      env,
      encoding: 'utf8',
    });
    if (r.status === 0) console.log(`Created database ${db}`);
    else if (/already exists/.test(r.stderr)) console.log(`Database ${db} already exists`);
    else console.error(r.stderr);
  }
  console.log(`\nDATABASE_URL="postgresql://${user}:${password}@127.0.0.1:${port}/fitclub?schema=public"`);
}

function start() {
  if (isRunning()) return console.log(`PostgreSQL already running on port ${port}`);
  // stdio must be detached: the server inherits handles on Windows and would keep this process alive.
  run('pg_ctl', ['start', '-D', dataDir, '-l', logFile, '-w', '-o', `-p ${port} -c listen_addresses=127.0.0.1`], {
    stdio: 'ignore',
  });
  console.log(`PostgreSQL started on 127.0.0.1:${port} (log: ${logFile})`);
}

function stop() {
  if (!isRunning()) return console.log('PostgreSQL is not running');
  run('pg_ctl', ['stop', '-D', dataDir, '-m', 'fast']);
}

const cmd = process.argv[2];
if (cmd === 'init') init();
else if (cmd === 'start') start();
else if (cmd === 'stop') stop();
else if (cmd === 'status') console.log(isRunning() ? `running on ${port} (${dataDir})` : 'stopped');
else {
  console.log('Usage: node scripts/dev-db.mjs <init|start|stop|status>');
  process.exit(1);
}
