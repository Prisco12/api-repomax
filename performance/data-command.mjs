import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const command = process.argv[2] || 'seed';
if (!['seed', 'cleanup'].includes(command))
  throw new Error('Use seed or cleanup');

const forwardedArguments = process.argv.slice(3);
const dockerArguments = [
  'compose',
  '-f',
  'docker-compose.yml',
  'run',
  '--rm',
  '--build',
  'api',
  'npm',
  'exec',
  '--',
  'tsx',
  'scripts/performance-data.ts',
  command,
  ...forwardedArguments,
];

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn('docker', dockerArguments, {
    cwd: rootDirectory,
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });
  child.on('error', reject);
  child.on('close', (code) => resolve(code ?? 1));
});

process.exitCode = exitCode;
