import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateComparisonReport,
  generateIndividualReport,
} from './report.mjs';

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const performanceDirectory = path.join(rootDirectory, 'performance');
const trackedServices = [
  'web',
  'api',
  'postgres',
  'redis',
  'prometheus',
  'grafana',
  'loki',
  'tempo',
  'alloy',
];
const scenario = process.argv[2] || 'smoke';
const profileName = process.argv[3] || 'small';
const skipStackStart =
  process.argv.includes('--no-start') || process.env.PERF_NO_START === 'true';

const profiles = {
  small: {
    name: 'small',
    label: 'Small — 2 vCPU / 4 GB',
    totalVcpu: 2,
    totalMemoryGb: 4,
    composeFile: 'docker-compose.performance-small.yml',
  },
  medium: {
    name: 'medium',
    label: 'Medium — 4 vCPU / 8 GB',
    totalVcpu: 4,
    totalMemoryGb: 8,
    composeFile: 'docker-compose.performance-medium.yml',
  },
};

if (!['smoke', 'load', 'stress'].includes(scenario)) {
  throw new Error(`Unknown scenario "${scenario}". Use smoke, load or stress.`);
}
const profile = profiles[profileName];
if (!profile)
  throw new Error(`Unknown profile "${profileName}". Use small or medium.`);

function readEnvironmentFile(content) {
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );
}

async function loadEnvironment() {
  let fileEnvironment = {};
  try {
    fileEnvironment = readEnvironmentFile(
      await fs.readFile(path.join(rootDirectory, '.env'), 'utf8'),
    );
  } catch {
    // Environment variables can be supplied directly when .env is unavailable.
  }
  return { ...fileEnvironment, ...process.env };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDirectory,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: options.env || process.env,
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    if (options.capture) {
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
    }
    child.on('error', reject);
    child.on('close', (code) => {
      const result = {
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
      if (options.allowFailure || code === 0) resolve(result);
      else
        reject(
          new Error(`${command} exited with code ${code}: ${stderr.trim()}`),
        );
    });
  });
}

const composeArgs = (extra = []) => [
  'compose',
  '-f',
  'docker-compose.yml',
  '-f',
  'docker-compose.performance.yml',
  '-f',
  'docker-compose.observability.yml',
  '-f',
  profile.composeFile,
  ...extra,
];

async function prepareStack(environment) {
  console.log(`\nPreparing ${profile.label}...`);
  await run(
    'docker',
    composeArgs(['up', '-d', 'postgres', 'redis', 'mailpit']),
    {
      env: environment,
    },
  );
  await run('docker', composeArgs(['build', 'api', 'web']), {
    env: environment,
  });
  await run(
    'docker',
    composeArgs([
      'run',
      '--rm',
      '--no-deps',
      'api',
      'npx',
      'prisma',
      'migrate',
      'deploy',
    ]),
    { env: environment },
  );
  await run(
    'docker',
    composeArgs(['run', '--rm', '--no-deps', 'api', 'npm', 'run', 'seed']),
    { env: environment },
  );
  await run('docker', composeArgs(['up', '-d', ...trackedServices]), {
    env: environment,
  });
}

async function waitForApi(baseUrl) {
  let lastError = 'API unavailable';
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health/ready`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`API did not become ready: ${lastError}`);
}

async function serviceContainers(environment) {
  const entries = await Promise.all(
    trackedServices.map(async (service) => {
      const result = await run('docker', composeArgs(['ps', '-q', service]), {
        capture: true,
        env: environment,
      });
      if (!result.stdout)
        throw new Error(`Container for ${service} was not found.`);
      return [result.stdout.split(/\r?\n/)[0], service];
    }),
  );
  return Object.fromEntries(entries);
}

function parsePercent(value) {
  return (
    Number.parseFloat(
      String(value || '0')
        .replace('%', '')
        .replace(',', '.'),
    ) || 0
  );
}

function parseBytes(value) {
  const match = String(value || '')
    .trim()
    .match(/^([\d.,]+)\s*([kmgt]?i?b)$/i);
  if (!match) return 0;
  const amount = Number.parseFloat(match[1].replace(',', '.'));
  const unit = match[2].toLowerCase();
  const factors = {
    b: 1,
    kb: 1_000,
    kib: 1024,
    mb: 1_000 ** 2,
    mib: 1024 ** 2,
    gb: 1_000 ** 3,
    gib: 1024 ** 3,
    tb: 1_000 ** 4,
    tib: 1024 ** 4,
  };
  return amount * (factors[unit] || 1);
}

async function sampleResources(containers, environment) {
  const ids = Object.keys(containers);
  const result = await run(
    'docker',
    ['stats', '--no-stream', '--format', '{{json .}}', ...ids],
    { capture: true, allowFailure: true, env: environment },
  );
  if (result.code !== 0 || !result.stdout) return null;

  const services = {};
  for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) {
    try {
      const item = JSON.parse(line);
      const id = ids.find(
        (candidate) =>
          candidate.startsWith(item.ID || '') ||
          String(item.ID || '').startsWith(candidate),
      );
      if (!id) continue;
      const memoryUsed = String(item.MemUsage || '')
        .split('/')[0]
        .trim();
      services[containers[id]] = {
        cpuPercent: parsePercent(item.CPUPerc),
        memoryBytes: parseBytes(memoryUsed),
      };
    } catch {
      // One malformed Docker stats line should not invalidate the whole run.
    }
  }
  return { timestamp: new Date().toISOString(), services };
}

async function sampleDatabaseConnections(containers, environment) {
  const postgresId = Object.entries(containers).find(
    ([, service]) => service === 'postgres',
  )?.[0];
  if (!postgresId) return null;
  const databaseName = environment.POSTGRES_DB || 'nest_api';
  const databaseUser = environment.POSTGRES_USER || 'postgres';
  const query = `SELECT json_build_object(
    'total', COUNT(*) FILTER (WHERE pid <> pg_backend_pid()),
    'active', COUNT(*) FILTER (WHERE pid <> pg_backend_pid() AND state = 'active'),
    'waiting', COUNT(*) FILTER (WHERE pid <> pg_backend_pid() AND state <> 'idle' AND wait_event_type IS NOT NULL),
    'maximum', (SELECT setting::int FROM pg_settings WHERE name = 'max_connections')
  )::text FROM pg_stat_activity WHERE datname = current_database();`;
  const result = await run(
    'docker',
    [
      'exec',
      postgresId,
      'psql',
      '-U',
      databaseUser,
      '-d',
      databaseName,
      '-At',
      '-c',
      query,
    ],
    { capture: true, allowFailure: true, env: environment },
  );
  if (result.code !== 0 || !result.stdout) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

async function collectDatabaseActivity(containers, environment) {
  const postgresId = Object.entries(containers).find(
    ([, service]) => service === 'postgres',
  )?.[0];
  if (!postgresId) return {};
  const databaseName = environment.POSTGRES_DB || 'nest_api';
  const databaseUser = environment.POSTGRES_USER || 'postgres';
  const query = `SELECT COALESCE(json_object_agg(relname, json_build_object(
    'sequentialScans', seq_scan,
    'rowsReadSequentially', seq_tup_read,
    'indexScans', idx_scan,
    'rowsFetchedByIndex', idx_tup_fetch
  )), '{}'::json)::text
  FROM pg_stat_user_tables
  WHERE relname IN ('Product', 'ProductCategory', 'ProductImage', 'Category');`;
  const result = await run(
    'docker',
    [
      'exec',
      postgresId,
      'psql',
      '-U',
      databaseUser,
      '-d',
      databaseName,
      '-At',
      '-c',
      query,
    ],
    { capture: true, allowFailure: true, env: environment },
  );
  if (result.code !== 0 || !result.stdout) return {};
  try {
    return JSON.parse(result.stdout);
  } catch {
    return {};
  }
}

function databaseActivityDifference(before, after) {
  return Object.fromEntries(
    Object.entries(after).map(([table, values]) => [
      table,
      Object.fromEntries(
        Object.entries(values).map(([metricName, value]) => [
          metricName,
          Math.max(0, Number(value) - Number(before[table]?.[metricName] || 0)),
        ]),
      ),
    ]),
  );
}

function average(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function summarizeResources(samples) {
  const services = {};
  for (const service of trackedServices) {
    const values = samples
      .map((sample) => sample.services[service])
      .filter(Boolean);
    const cpu = values.map((value) => value.cpuPercent);
    const memory = values.map((value) => value.memoryBytes);
    services[service] = {
      cpuAveragePercent: average(cpu),
      cpuMaxPercent: cpu.length ? Math.max(...cpu) : 0,
      memoryAverageBytes: average(memory),
      memoryMaxBytes: memory.length ? Math.max(...memory) : 0,
    };
  }
  const totalCpu = samples.map((sample) =>
    Object.values(sample.services).reduce(
      (sum, value) => sum + value.cpuPercent,
      0,
    ),
  );
  const totalMemory = samples.map((sample) =>
    Object.values(sample.services).reduce(
      (sum, value) => sum + value.memoryBytes,
      0,
    ),
  );
  const memoryCapacity = profile.totalMemoryGb * 1024 ** 3;
  const endingSamples = samples.slice(-3);
  const endingCpu = endingSamples.map((sample) =>
    Object.values(sample.services).reduce(
      (sum, value) => sum + value.cpuPercent,
      0,
    ),
  );
  const firstMemory = totalMemory[0] || 0;
  const lastMemory = totalMemory.at(-1) || 0;
  const databaseConnections = samples
    .map((sample) => sample.databaseConnections)
    .filter(Boolean);
  const connectionValues = (field) =>
    databaseConnections.map((connections) => Number(connections[field]) || 0);
  const totalConnections = connectionValues('total');
  const activeConnections = connectionValues('active');
  const waitingConnections = connectionValues('waiting');
  return {
    services,
    databaseConnections: {
      averageTotal: average(totalConnections),
      maximumTotal: totalConnections.length ? Math.max(...totalConnections) : 0,
      maximumActive: activeConnections.length
        ? Math.max(...activeConnections)
        : 0,
      maximumWaiting: waitingConnections.length
        ? Math.max(...waitingConnections)
        : 0,
      configuredMaximum: databaseConnections.at(-1)?.maximum || 0,
    },
    total: {
      normalizedCpuAveragePercent: average(totalCpu) / profile.totalVcpu,
      normalizedCpuMaxPercent:
        (totalCpu.length ? Math.max(...totalCpu) : 0) / profile.totalVcpu,
      memoryAverageBytes: average(totalMemory),
      memoryMaxBytes: totalMemory.length ? Math.max(...totalMemory) : 0,
      memoryMaxPercent:
        ((totalMemory.length ? Math.max(...totalMemory) : 0) / memoryCapacity) *
        100,
      endingNormalizedCpuPercent: average(endingCpu) / profile.totalVcpu,
      memoryGrowthBytes: lastMemory - firstMemory,
      memoryGrowthPercent:
        firstMemory > 0 ? ((lastMemory - firstMemory) / firstMemory) * 100 : 0,
    },
  };
}

async function commandBytes(containerId, target, environment) {
  const result = await run(
    'docker',
    ['exec', containerId, 'du', '-sk', target],
    {
      capture: true,
      allowFailure: true,
      env: environment,
    },
  );
  if (result.code !== 0) return 0;
  return (Number.parseFloat(result.stdout.split(/\s+/)[0]) || 0) * 1024;
}

async function collectStorage(containers, environment) {
  const postgresId = Object.entries(containers).find(
    ([, service]) => service === 'postgres',
  )?.[0];
  const webId = Object.entries(containers).find(
    ([, service]) => service === 'web',
  )?.[0];
  const databaseName = environment.POSTGRES_DB || 'nest_api';
  const databaseUser = environment.POSTGRES_USER || 'postgres';
  const databaseQuery = `SELECT json_build_object(
    'databaseBytes', pg_database_size(current_database()),
    'tableBytes', COALESCE((SELECT SUM(pg_table_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) FROM pg_tables WHERE schemaname = 'public'), 0),
    'indexBytes', COALESCE((SELECT SUM(pg_indexes_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) FROM pg_tables WHERE schemaname = 'public'), 0)
    , 'activeConnections', (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database())
    , 'maxConnections', (SELECT setting::int FROM pg_settings WHERE name = 'max_connections')
  )::text;`;
  const databaseResult = postgresId
    ? await run(
        'docker',
        [
          'exec',
          postgresId,
          'psql',
          '-U',
          databaseUser,
          '-d',
          databaseName,
          '-At',
          '-c',
          databaseQuery,
        ],
        { capture: true, allowFailure: true, env: environment },
      )
    : null;
  let database = {};
  try {
    database = JSON.parse(databaseResult?.stdout || '{}');
  } catch {
    database = {
      collectionError: databaseResult?.stderr || 'Invalid psql output',
    };
  }

  const volumes = {};
  const volumeTargets = {
    api: '/app/uploads',
    postgres: '/var/lib/postgresql/data',
    redis: '/data',
    prometheus: '/prometheus',
    grafana: '/var/lib/grafana',
    loki: '/loki',
    tempo: '/var/tempo',
  };
  for (const [containerId, service] of Object.entries(containers)) {
    const target = volumeTargets[service];
    if (target)
      volumes[service] = await commandBytes(containerId, target, environment);
  }

  const imageIds = {};
  for (const [containerId, service] of Object.entries(containers)) {
    const image = await run(
      'docker',
      ['inspect', '--format', '{{.Image}}', containerId],
      { capture: true, allowFailure: true, env: environment },
    );
    if (image.stdout) imageIds[service] = image.stdout;
  }
  const uniqueImageSizes = {};
  for (const imageId of new Set(Object.values(imageIds))) {
    const size = await run(
      'docker',
      ['image', 'inspect', '--format', '{{.Size}}', imageId],
      { capture: true, allowFailure: true, env: environment },
    );
    uniqueImageSizes[imageId] = Number(size.stdout) || 0;
  }
  const imagesByService = Object.fromEntries(
    Object.entries(imageIds).map(([service, imageId]) => [
      service,
      uniqueImageSizes[imageId] || 0,
    ]),
  );

  const fileSystem = await fs.statfs(rootDirectory);
  const hostTotalBytes = Number(fileSystem.blocks) * Number(fileSystem.bsize);
  const hostFreeBytes = Number(fileSystem.bavail) * Number(fileSystem.bsize);
  return {
    database,
    frontendBuildBytes: webId
      ? await commandBytes(webId, '/srv/frontend', environment)
      : 0,
    volumes,
    dockerImages: {
      byService: imagesByService,
      uniqueTotalBytes: Object.values(uniqueImageSizes).reduce(
        (sum, size) => sum + size,
        0,
      ),
      note: 'Service image sizes can share Docker layers; the unique total counts each image once.',
    },
    logs: {
      configuredMaxPerContainerBytes: 20 * 1024 ** 2 * 5,
      trackedContainers: trackedServices.length,
      configuredMaxTotalBytes: 20 * 1024 ** 2 * 5 * trackedServices.length,
    },
    hostFilesystem: {
      totalBytes: hostTotalBytes,
      freeBytes: hostFreeBytes,
      usedPercent:
        hostTotalBytes > 0
          ? ((hostTotalBytes - hostFreeBytes) / hostTotalBytes) * 100
          : 0,
      warningPercent: 70,
      criticalPercent: 85,
      note: 'Local host measurement; repeat on the VPS because Docker Desktop uses its own virtual disk.',
    },
  };
}

function expectedMaxVirtualUsers(environment) {
  const defaults = { smoke: 2, load: 50, stress: 200 };
  const keys = {
    smoke: 'PERF_SMOKE_VUS',
    load: 'PERF_LOAD_PEAK_VUS',
    stress: 'PERF_STRESS_THIRD_VUS',
  };
  return Number(environment[keys[scenario]] || defaults[scenario]);
}

const environment = await loadEnvironment();
const hostPort = environment.PERF_HTTP_PORT || '8080';
const hostBaseUrl = (
  environment.PERF_BASE_URL || `http://localhost:${hostPort}/api/v1`
).replace(/\/$/, '');
const k6BaseUrl = environment.PERF_BASE_URL
  ? hostBaseUrl
  : `http://host.docker.internal:${hostPort}/api/v1`;

if (!skipStackStart) await prepareStack(environment);
await waitForApi(hostBaseUrl);

const containers = await serviceContainers(environment);
const databaseActivityBefore = await collectDatabaseActivity(
  containers,
  environment,
);
const resultDirectory = path.join(
  performanceDirectory,
  'results',
  profileName,
  scenario,
);
await fs.rm(resultDirectory, { recursive: true, force: true });
await fs.mkdir(resultDirectory, { recursive: true });

const startedAt = new Date().toISOString();
const samples = [];
let collecting = false;
const collect = async () => {
  if (collecting) return;
  collecting = true;
  try {
    const [sample, databaseConnections] = await Promise.all([
      sampleResources(containers, environment),
      sampleDatabaseConnections(containers, environment),
    ]);
    if (sample) samples.push({ ...sample, databaseConnections });
  } finally {
    collecting = false;
  }
};
await collect();
const interval = setInterval(
  collect,
  Number(environment.PERF_SAMPLE_INTERVAL_MS || 2_000),
);

const childEnvironment = {
  ...environment,
  API_BASE_URL: k6BaseUrl,
  PERF_PROFILE: profileName,
};
const forwardedVariables = Object.keys(childEnvironment).filter(
  (key) =>
    key.startsWith('PERF_') ||
    ['API_BASE_URL', 'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD'].includes(key),
);
const dockerArguments = [
  'run',
  '--rm',
  '--add-host',
  'host.docker.internal:host-gateway',
  '-v',
  `${performanceDirectory}:/scripts:ro`,
  '-v',
  `${resultDirectory}:/results`,
  ...forwardedVariables.flatMap((key) => ['-e', key]),
  'grafana/k6:latest',
  'run',
  `/scripts/${scenario}.js`,
];

console.log(`\nRunning ${scenario} on ${profile.label}...\n`);
const k6Result = await run('docker', dockerArguments, {
  allowFailure: true,
  env: childEnvironment,
});
clearInterval(interval);
while (collecting) await new Promise((resolve) => setTimeout(resolve, 50));
await collect();

let postTestHealthy = false;
try {
  const response = await fetch(`${hostBaseUrl}/health/ready`, {
    signal: AbortSignal.timeout(5_000),
  });
  postTestHealthy = response.ok;
} catch {
  postTestHealthy = false;
}

const resources = {
  samples,
  summary: summarizeResources(samples),
  databaseActivity: databaseActivityDifference(
    databaseActivityBefore,
    await collectDatabaseActivity(containers, environment),
  ),
  storage: await collectStorage(containers, environment),
};
const metadata = {
  scenario,
  profile,
  startedAt,
  finishedAt: new Date().toISOString(),
  exitCode: k6Result.code,
  expectedMaxVirtualUsers: expectedMaxVirtualUsers(environment),
  performanceRateLimitMax: Number(environment.PERF_RATE_LIMIT_MAX || 1_000_000),
  sampleIntervalMs: Number(environment.PERF_SAMPLE_INTERVAL_MS || 2_000),
  resourceSamples: samples.length,
  postTestHealthy,
};
await Promise.all([
  fs.writeFile(
    path.join(resultDirectory, 'resources.json'),
    JSON.stringify(resources, null, 2),
  ),
  fs.writeFile(
    path.join(resultDirectory, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
  ),
]);

let reportGenerated = false;
try {
  const result = await generateIndividualReport(resultDirectory);
  await generateComparisonReport();
  reportGenerated = true;
  console.log(`\nResult: ${result.statusLabel}`);
  console.log(
    `Individual report: ${path.join(resultDirectory, 'report.html')}`,
  );
  console.log(
    `Comparison: ${path.join(performanceDirectory, 'results', 'comparison.html')}`,
  );
} catch (error) {
  console.error(
    `Could not generate report: ${error instanceof Error ? error.message : error}`,
  );
  process.exitCode = 1;
}

if (k6Result.code !== 0) {
  console.error(
    reportGenerated
      ? `k6 finished with code ${k6Result.code}; inspect the generated report.`
      : `k6 could not complete (code ${k6Result.code}) and no performance report was produced.`,
  );
  process.exitCode = k6Result.code;
}
