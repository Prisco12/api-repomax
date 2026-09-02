import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const runs = [
  ['smoke', 'small'],
  ['load', 'small'],
  ['load', 'medium'],
];

const failures = [];
for (const [scenario, profile] of runs) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['performance/run.mjs', scenario, profile],
      {
        cwd: rootDirectory,
        stdio: 'inherit',
        env: process.env,
      },
    );
    child.on('error', reject);
    child.on('close', (exitCode) => resolve(exitCode ?? 1));
  });
  if (code !== 0) {
    failures.push(`${scenario}/${profile}`);
    console.error(
      `${scenario}/${profile} exceeded a limit; continuing so the profiles can still be compared.`,
    );
  }
}

console.log(
  '\nPerformance suite completed. Open performance/results/comparison.html',
);
if (failures.length) {
  console.error(`Runs requiring attention: ${failures.join(', ')}`);
  process.exitCode = 1;
}
