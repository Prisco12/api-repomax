import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const profileName = process.argv[2] || 'medium';
if (!['small', 'medium'].includes(profileName)) {
  throw new Error('Use small or medium as the profile name.');
}

function run(command, args, { capture = false, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDirectory,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: false,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
    }
    child.on('error', reject);
    child.on('close', (code) => {
      const result = { code: code ?? 1, stdout: stdout.trim(), stderr };
      if (result.code === 0 || allowFailure) resolve(result);
      else
        reject(
          new Error(`${command} exited with code ${result.code}: ${stderr}`),
        );
    });
  });
}

async function readEnvironment() {
  let fileEnvironment = {};
  try {
    const content = await fs.readFile(path.join(rootDirectory, '.env'), 'utf8');
    fileEnvironment = Object.fromEntries(
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const separator = line.indexOf('=');
          return [
            line.slice(0, separator).trim(),
            line
              .slice(separator + 1)
              .trim()
              .replace(/^(['"])(.*)\1$/, '$2'),
          ];
        }),
    );
  } catch {
    // Direct environment variables are enough when no .env file exists.
  }
  return { ...fileEnvironment, ...process.env };
}

const composeArgs = (extra) => [
  'compose',
  '-f',
  'docker-compose.yml',
  '-f',
  'docker-compose.performance.yml',
  '-f',
  `docker-compose.performance-${profileName}.yml`,
  ...extra,
];

const environment = await readEnvironment();
const postgres = await run('docker', composeArgs(['ps', '-q', 'postgres']), {
  capture: true,
});
if (!postgres.stdout) {
  throw new Error(
    'PostgreSQL is not running. Run a performance scenario first.',
  );
}

const containerId = postgres.stdout.split(/\r?\n/)[0];
const database = environment.POSTGRES_DB || 'nest_api';
const user = environment.POSTGRES_USER || 'postgres';
const port = environment.PERF_HTTP_PORT || '8080';
const healthUrl = `http://localhost:${port}/api/v1/health/ready`;
const temporaryBackup = '/tmp/repomax-performance-backup.dump';
let finished = false;

const backup = run(
  'docker',
  [
    'exec',
    containerId,
    'pg_dump',
    '-U',
    user,
    '-d',
    database,
    '-Fc',
    '-f',
    temporaryBackup,
  ],
  { capture: true, allowFailure: true },
).finally(() => {
  finished = true;
});

let checks = 0;
let failures = 0;
let maximumLatencyMs = 0;
do {
  const started = performance.now();
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) failures += 1;
  } catch {
    failures += 1;
  }
  maximumLatencyMs = Math.max(maximumLatencyMs, performance.now() - started);
  checks += 1;
  if (!finished) await new Promise((resolve) => setTimeout(resolve, 100));
} while (!finished);

const backupResult = await backup;
const sizeResult = await run(
  'docker',
  ['exec', containerId, 'stat', '-c', '%s', temporaryBackup],
  { capture: true, allowFailure: true },
);
await run('docker', ['exec', containerId, 'rm', '-f', temporaryBackup], {
  capture: true,
  allowFailure: true,
});

const backupBytes = Number(sizeResult.stdout) || 0;
console.log('\nBackup coexistence check');
console.log(`Backup exit code: ${backupResult.code}`);
console.log(
  `Temporary backup size: ${(backupBytes / 1024 / 1024).toFixed(2)} MB`,
);
console.log(`API health checks: ${checks}`);
console.log(`Health failures: ${failures}`);
console.log(`Maximum health latency: ${maximumLatencyMs.toFixed(2)} ms`);
console.log('Temporary backup removed: yes');

if (backupResult.code !== 0 || failures > 0 || backupBytes === 0) {
  process.exitCode = 1;
}
