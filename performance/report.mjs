import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const performanceDirectory = path.dirname(fileURLToPath(import.meta.url));
const resultsDirectory = path.join(performanceDirectory, 'results');
const routeDefinitions = [
  ['route_public_products_duration', 'Produtos públicos'],
  ['route_public_search_name_duration', 'Busca pública por nome'],
  ['route_public_search_sku_duration', 'Busca pública por SKU'],
  ['route_public_search_slug_duration', 'Busca pública por slug'],
  ['route_public_categories_duration', 'Categorias públicas'],
  ['route_admin_products_duration', 'Produtos administrativos'],
  ['route_admin_search_name_duration', 'Busca administrativa por nome'],
  ['route_admin_search_sku_duration', 'Busca administrativa por SKU'],
  ['route_admin_search_slug_duration', 'Busca administrativa por slug'],
  ['route_admin_categories_duration', 'Categorias administrativas'],
];

function number(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function round(value, digits = 2) {
  return Number(number(value).toFixed(digits));
}

function metric(summary, name, field) {
  return number(summary?.metrics?.[name]?.values?.[field]);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatBytes(bytes) {
  const value = number(bytes);
  if (value >= 1024 ** 3) return `${round(value / 1024 ** 3)} GB`;
  if (value >= 1024 ** 2) return `${round(value / 1024 ** 2)} MB`;
  return `${round(value / 1024)} KB`;
}

function statusFor(result) {
  const { p95Ms, errorRate, checksRate } = result.k6;
  const { normalizedCpuMaxPercent, memoryMaxPercent } = result.resources.total;
  const failed =
    result.metadata.exitCode !== 0 ||
    p95Ms >= 500 ||
    errorRate >= 1 ||
    checksRate < 99 ||
    normalizedCpuMaxPercent >= 90 ||
    memoryMaxPercent >= 90;
  if (failed) return 'insufficient';

  const nearLimit =
    p95Ms >= 400 ||
    errorRate >= 0.5 ||
    normalizedCpuMaxPercent >= 70 ||
    memoryMaxPercent >= 80;
  return nearLimit ? 'limit' : 'healthy';
}

function statusLabel(status) {
  return {
    healthy: 'Saudável',
    limit: 'No limite',
    insufficient: 'Insuficiente',
  }[status];
}

function reasonsFor(result) {
  const reasons = [];
  if (result.k6.p95Ms >= 500)
    reasons.push(`p95 de ${result.k6.p95Ms} ms ultrapassou 500 ms`);
  if (result.k6.errorRate >= 1)
    reasons.push(`erros de ${result.k6.errorRate}% ultrapassaram 1%`);
  if (result.k6.checksRate < 99)
    reasons.push(`somente ${result.k6.checksRate}% das verificações passaram`);
  if (result.resources.total.normalizedCpuMaxPercent >= 90)
    reasons.push('CPU chegou à zona de saturação');
  else if (result.resources.total.normalizedCpuMaxPercent >= 70)
    reasons.push('CPU ficou próxima do limite recomendado');
  if (result.resources.total.memoryMaxPercent >= 90)
    reasons.push('memória chegou à zona de saturação');
  else if (result.resources.total.memoryMaxPercent >= 80)
    reasons.push('memória ficou próxima do limite recomendado');
  if (!reasons.length)
    reasons.push('latência, erros, CPU e memória permaneceram com margem');
  return reasons;
}

function buildResult(summary, resources, metadata) {
  const services = Object.fromEntries(
    Object.entries(resources.summary?.services || {}).map(([name, values]) => [
      name,
      {
        cpuAveragePercent: round(values.cpuAveragePercent),
        cpuMaxPercent: round(values.cpuMaxPercent),
        memoryAverageBytes: Math.round(number(values.memoryAverageBytes)),
        memoryMaxBytes: Math.round(number(values.memoryMaxBytes)),
      },
    ]),
  );
  const result = {
    metadata,
    k6: {
      requests: Math.round(metric(summary, 'http_reqs', 'count')),
      requestsPerSecond: round(metric(summary, 'http_reqs', 'rate')),
      iterations: Math.round(metric(summary, 'iterations', 'count')),
      maxVirtualUsers: Math.round(
        metric(summary, 'vus_max', 'max') || metadata.expectedMaxVirtualUsers,
      ),
      averageMs: round(metric(summary, 'http_req_duration', 'avg')),
      p95Ms: round(metric(summary, 'http_req_duration', 'p(95)')),
      p99Ms: round(metric(summary, 'http_req_duration', 'p(99)')),
      errorRate: round(metric(summary, 'http_req_failed', 'rate') * 100),
      checksRate: round(metric(summary, 'checks', 'rate') * 100),
      routes: routeDefinitions
        .filter(([metricName]) => summary?.metrics?.[metricName])
        .map(([metricName, label]) => ({
          metricName,
          label,
          averageMs: round(metric(summary, metricName, 'avg')),
          p95Ms: round(metric(summary, metricName, 'p(95)')),
          p99Ms: round(metric(summary, metricName, 'p(99)')),
          maximumMs: round(metric(summary, metricName, 'max')),
        })),
    },
    resources: {
      services,
      storage: resources.storage || {},
      databaseActivity: resources.databaseActivity || {},
      databaseConnections: {
        averageTotal: round(
          resources.summary?.databaseConnections?.averageTotal,
        ),
        maximumTotal: Math.round(
          number(resources.summary?.databaseConnections?.maximumTotal),
        ),
        maximumActive: Math.round(
          number(resources.summary?.databaseConnections?.maximumActive),
        ),
        maximumWaiting: Math.round(
          number(resources.summary?.databaseConnections?.maximumWaiting),
        ),
        configuredMaximum: Math.round(
          number(resources.summary?.databaseConnections?.configuredMaximum),
        ),
      },
      total: {
        normalizedCpuAveragePercent: round(
          resources.summary?.total?.normalizedCpuAveragePercent,
        ),
        normalizedCpuMaxPercent: round(
          resources.summary?.total?.normalizedCpuMaxPercent,
        ),
        memoryAverageBytes: Math.round(
          number(resources.summary?.total?.memoryAverageBytes),
        ),
        memoryMaxBytes: Math.round(
          number(resources.summary?.total?.memoryMaxBytes),
        ),
        memoryMaxPercent: round(resources.summary?.total?.memoryMaxPercent),
        endingNormalizedCpuPercent: round(
          resources.summary?.total?.endingNormalizedCpuPercent,
        ),
        memoryGrowthBytes: Math.round(
          number(resources.summary?.total?.memoryGrowthBytes),
        ),
        memoryGrowthPercent: round(
          resources.summary?.total?.memoryGrowthPercent,
        ),
      },
    },
  };
  result.status = statusFor(result);
  result.statusLabel = statusLabel(result.status);
  result.reasons = reasonsFor(result);
  return result;
}

function documentShell(title, body) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #102033; background: #f3f6fa; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; }
    main { max-width: 1180px; margin: auto; }
    h1 { margin: 0 0 8px; font-size: 32px; }
    h2 { margin: 32px 0 12px; font-size: 20px; }
    .subtitle { margin: 0; color: #627086; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit,minmax(170px,1fr)); gap: 12px; margin-top: 24px; }
    .card, .panel { background: white; border: 1px solid #dce3ec; border-radius: 14px; padding: 18px; box-shadow: 0 8px 24px rgba(24,42,70,.05); }
    .card small { display: block; color: #66758b; margin-bottom: 8px; }
    .card strong { font-size: 24px; }
    .badge { display: inline-flex; padding: 7px 11px; border-radius: 999px; font-weight: 700; }
    .healthy { background: #dcf7e7; color: #136b3a; }
    .limit { background: #fff0c7; color: #855800; }
    .insufficient { background: #ffe1df; color: #a52c25; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 14px; overflow: hidden; }
    th, td { padding: 13px 14px; text-align: left; border-bottom: 1px solid #e5eaf0; white-space: nowrap; }
    th { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #647187; background: #f8fafc; }
    tr:last-child td { border-bottom: 0; }
    ul { margin-bottom: 0; }
    .scroll { overflow-x: auto; border: 1px solid #dce3ec; border-radius: 14px; }
    .bar { height: 9px; background: #e7edf4; border-radius: 999px; overflow: hidden; margin-top: 9px; }
    .bar > span { display: block; height: 100%; background: #ffb400; border-radius: inherit; }
    .muted { color: #66758b; }
    @media (max-width: 650px) { body { padding: 18px; } h1 { font-size: 26px; } }
  </style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function serviceRows(result) {
  return Object.entries(result.resources.services)
    .map(
      ([service, values]) => `<tr>
        <td><strong>${escapeHtml(service)}</strong></td>
        <td>${values.cpuAveragePercent}%</td>
        <td>${values.cpuMaxPercent}%</td>
        <td>${formatBytes(values.memoryAverageBytes)}</td>
        <td>${formatBytes(values.memoryMaxBytes)}</td>
      </tr>`,
    )
    .join('');
}

function routeRows(result) {
  return (result.k6.routes || [])
    .map(
      (route) => `<tr>
        <td><strong>${escapeHtml(route.label)}</strong></td>
        <td>${route.averageMs} ms</td>
        <td>${route.p95Ms} ms</td>
        <td>${route.p99Ms} ms</td>
        <td>${route.maximumMs} ms</td>
      </tr>`,
    )
    .join('');
}

function databaseActivityRows(result) {
  return Object.entries(result.resources.databaseActivity || {})
    .sort(
      ([, left], [, right]) =>
        number(right.rowsReadSequentially) - number(left.rowsReadSequentially),
    )
    .map(
      ([table, values]) => `<tr>
        <td><strong>${escapeHtml(table)}</strong></td>
        <td>${number(values.sequentialScans).toLocaleString('pt-BR')}</td>
        <td>${number(values.rowsReadSequentially).toLocaleString('pt-BR')}</td>
        <td>${number(values.indexScans).toLocaleString('pt-BR')}</td>
        <td>${number(values.rowsFetchedByIndex).toLocaleString('pt-BR')}</td>
      </tr>`,
    )
    .join('');
}

function storageRows(result) {
  const storage = result.resources.storage || {};
  const database = storage.database || {};
  const volumes = storage.volumes || {};
  const images = storage.dockerImages || {};
  const logs = storage.logs || {};
  const disk = storage.hostFilesystem || {};
  const diskStatus =
    number(disk.usedPercent) >= number(disk.criticalPercent, 85)
      ? 'Crítico'
      : number(disk.usedPercent) >= number(disk.warningPercent, 70)
        ? 'Atenção'
        : 'Saudável';
  const observabilityVolumes = [
    ['Prometheus', volumes.prometheus],
    ['Grafana', volumes.grafana],
    ['Loki', volumes.loki],
    ['Tempo', volumes.tempo],
  ]
    .filter(([, bytes]) => number(bytes) > 0)
    .map(
      ([label, bytes]) =>
        `<tr><th>Volume ${label}</th><td>${formatBytes(bytes)}</td><td>Dados persistidos de observabilidade</td></tr>`,
    )
    .join('');
  return `<tr><th>Banco PostgreSQL</th><td>${formatBytes(database.databaseBytes)}</td><td>Banco completo</td></tr>
    <tr><th>Tabelas PostgreSQL</th><td>${formatBytes(database.tableBytes)}</td><td>Dados das tabelas públicas</td></tr>
    <tr><th>Índices PostgreSQL</th><td>${formatBytes(database.indexBytes)}</td><td>Estruturas usadas para acelerar consultas</td></tr>
    <tr><th>Conexões PostgreSQL</th><td>${database.activeConnections || 0}/${database.maxConnections || 0}</td><td>Conexões abertas após o teste versus limite</td></tr>
    <tr><th>Volume PostgreSQL</th><td>${formatBytes(volumes.postgres)}</td><td>Dados, WAL e arquivos internos</td></tr>
    <tr><th>Volume Redis</th><td>${formatBytes(volumes.redis)}</td><td>Persistência local do Redis</td></tr>
    <tr><th>Uploads locais</th><td>${formatBytes(volumes.api)}</td><td>Deve permanecer baixo quando produção usa S3</td></tr>
    ${observabilityVolumes}
    <tr><th>Frontend compilado</th><td>${formatBytes(storage.frontendBuildBytes)}</td><td>Arquivos estáticos entregues pelo Caddy</td></tr>
    <tr><th>Imagens Docker do ambiente</th><td>${formatBytes(images.uniqueTotalBytes)}</td><td>Uma vez por imagem, sem o cache de build</td></tr>
    <tr><th>Limite configurado de logs</th><td>${formatBytes(logs.configuredMaxTotalBytes)}</td><td>${logs.trackedContainers || 0} containers monitorados</td></tr>
    <tr><th>Disco do computador</th><td>${round(disk.usedPercent)}% usado</td><td>${diskStatus}; alerta em ${disk.warningPercent || 70}% e crítico em ${disk.criticalPercent || 85}%</td></tr>`;
}

function individualHtml(result) {
  const profile = result.metadata.profile;
  const connections = result.resources.databaseConnections || {};
  const routes = routeRows(result);
  const databaseActivity = databaseActivityRows(result);
  const body = `
    <span class="badge ${result.status}">${result.statusLabel}</span>
    <h1>RepoMax — ${escapeHtml(profile.label)}</h1>
    <p class="subtitle">Cenário ${escapeHtml(result.metadata.scenario)} · ${escapeHtml(result.metadata.finishedAt)}</p>
    <section class="cards">
      <div class="card"><small>Usuários simultâneos</small><strong>${result.k6.maxVirtualUsers}</strong></div>
      <div class="card"><small>Requisições/s</small><strong>${result.k6.requestsPerSecond}</strong></div>
      <div class="card"><small>Latência p95</small><strong>${result.k6.p95Ms} ms</strong></div>
      <div class="card"><small>Latência p99</small><strong>${result.k6.p99Ms} ms</strong></div>
      <div class="card"><small>Erros</small><strong>${result.k6.errorRate}%</strong></div>
      <div class="card"><small>CPU alocada (pico)</small><strong>${result.resources.total.normalizedCpuMaxPercent}%</strong><div class="bar"><span style="width:${Math.min(result.resources.total.normalizedCpuMaxPercent, 100)}%"></span></div></div>
      <div class="card"><small>RAM total (pico)</small><strong>${formatBytes(result.resources.total.memoryMaxBytes)}</strong><div class="bar"><span style="width:${Math.min(result.resources.total.memoryMaxPercent, 100)}%"></span></div></div>
      <div class="card"><small>CPU após a carga</small><strong>${result.resources.total.endingNormalizedCpuPercent}%</strong></div>
      <div class="card"><small>Crescimento de RAM</small><strong>${result.resources.total.memoryGrowthPercent}%</strong></div>
    </section>
    <h2>Diagnóstico</h2>
    <div class="panel"><ul>${result.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul></div>
    <h2>Recursos por serviço</h2>
    <div class="scroll"><table><thead><tr><th>Serviço</th><th>CPU média</th><th>CPU máxima</th><th>RAM média</th><th>RAM máxima</th></tr></thead><tbody>${serviceRows(result)}</tbody></table></div>
    ${routes ? `<h2>Latência por endpoint</h2><div class="scroll"><table><thead><tr><th>Endpoint</th><th>Média</th><th>p95</th><th>p99</th><th>Máxima</th></tr></thead><tbody>${routes}</tbody></table></div>` : ''}
    <h2>Conexões durante a carga</h2>
    <div class="scroll"><table><tbody>
      <tr><th>Média de conexões</th><td>${round(connections.averageTotal)}</td></tr>
      <tr><th>Pico de conexões</th><td>${connections.maximumTotal || 0}</td></tr>
      <tr><th>Pico de conexões executando</th><td>${connections.maximumActive || 0}</td></tr>
      <tr><th>Pico esperando no PostgreSQL</th><td>${connections.maximumWaiting || 0}</td></tr>
      <tr><th>Limite do PostgreSQL</th><td>${connections.configuredMaximum || 0}</td></tr>
    </tbody></table></div>
    ${databaseActivity ? `<h2>Atividade do PostgreSQL durante o teste</h2><div class="scroll"><table><thead><tr><th>Tabela</th><th>Varreduras completas</th><th>Linhas lidas em varreduras</th><th>Buscas por índice</th><th>Linhas obtidas por índice</th></tr></thead><tbody>${databaseActivity}</tbody></table></div>` : ''}
    <h2>Armazenamento</h2>
    <div class="scroll"><table><thead><tr><th>Componente</th><th>Uso</th><th>Observação</th></tr></thead><tbody>${storageRows(result)}</tbody></table></div>
    <p class="muted">A medição de disco é local. Na VPS, execute o mesmo teste para medir o disco real do servidor.</p>
    <h2>Detalhes do teste</h2>
    <div class="scroll"><table><tbody>
      <tr><th>Total de requisições</th><td>${result.k6.requests}</td></tr>
      <tr><th>Tempo médio</th><td>${result.k6.averageMs} ms</td></tr>
      <tr><th>Verificações aprovadas</th><td>${result.k6.checksRate}%</td></tr>
      <tr><th>Limite do perfil</th><td>${profile.totalVcpu} vCPU / ${profile.totalMemoryGb} GB</td></tr>
      <tr><th>Rate limit durante o teste</th><td>${result.metadata.performanceRateLimitMax ?? 'não informado'} chamadas/min por endpoint/IP</td></tr>
      <tr><th>API saudável após o teste</th><td>${result.metadata.postTestHealthy ? 'Sim' : 'Não'}</td></tr>
    </tbody></table></div>`;
  return documentShell(`RepoMax Performance — ${profile.label}`, body);
}

export async function generateIndividualReport(resultDirectory) {
  const [summary, resources, metadata] = await Promise.all([
    fs
      .readFile(path.join(resultDirectory, 'k6-summary.json'), 'utf8')
      .then(JSON.parse),
    fs
      .readFile(path.join(resultDirectory, 'resources.json'), 'utf8')
      .then(JSON.parse),
    fs
      .readFile(path.join(resultDirectory, 'metadata.json'), 'utf8')
      .then(JSON.parse),
  ]);
  const result = buildResult(summary, resources, metadata);
  await Promise.all([
    fs.writeFile(
      path.join(resultDirectory, 'result.json'),
      JSON.stringify(result, null, 2),
    ),
    fs.writeFile(
      path.join(resultDirectory, 'report.html'),
      individualHtml(result),
    ),
  ]);
  return result;
}

async function findResults() {
  const found = [];
  let profiles = [];
  try {
    profiles = await fs.readdir(resultsDirectory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const profile of profiles.filter((item) => item.isDirectory())) {
    const profileDirectory = path.join(resultsDirectory, profile.name);
    const scenarios = await fs.readdir(profileDirectory, {
      withFileTypes: true,
    });
    for (const scenario of scenarios.filter((item) => item.isDirectory())) {
      const resultPath = path.join(
        profileDirectory,
        scenario.name,
        'result.json',
      );
      try {
        found.push(JSON.parse(await fs.readFile(resultPath, 'utf8')));
      } catch {
        // Incomplete runs are intentionally omitted from the comparison.
      }
    }
  }
  return found;
}

function comparisonHtml(results) {
  const sorted = [...results].sort((a, b) =>
    `${a.metadata.scenario}-${a.metadata.profile.totalVcpu}`.localeCompare(
      `${b.metadata.scenario}-${b.metadata.profile.totalVcpu}`,
    ),
  );
  const rows = sorted
    .map(
      (result) => `<tr>
        <td><strong>${escapeHtml(result.metadata.profile.label)}</strong></td>
        <td>${escapeHtml(result.metadata.scenario)}</td>
        <td>${result.k6.maxVirtualUsers}</td>
        <td>${result.k6.requestsPerSecond}</td>
        <td>${result.k6.averageMs} ms</td>
        <td>${result.k6.p95Ms} ms</td>
        <td>${result.k6.p99Ms} ms</td>
        <td>${result.k6.errorRate}%</td>
        <td>${result.resources.total.normalizedCpuMaxPercent}%</td>
        <td>${formatBytes(result.resources.total.memoryMaxBytes)}</td>
        <td>${formatBytes(result.resources.storage?.database?.databaseBytes)}</td>
        <td><span class="badge ${result.status}">${result.statusLabel}</span></td>
      </tr>`,
    )
    .join('');
  const healthyLoad = sorted
    .filter(
      (result) =>
        result.metadata.scenario === 'load' && result.status === 'healthy',
    )
    .sort(
      (a, b) => a.metadata.profile.totalVcpu - b.metadata.profile.totalVcpu,
    )[0];
  const recommendation = healthyLoad
    ? `Menor perfil saudável no teste de carga: <strong>${escapeHtml(healthyLoad.metadata.profile.label)}</strong>. Confirme o resultado na VPS real antes da produção.`
    : 'Nenhum perfil concluiu o teste de carga como saudável. Analise os relatórios individuais ou execute os cenários que faltam.';
  return documentShell(
    'RepoMax — Comparação de desempenho',
    `<h1>Comparação de desempenho</h1>
    <p class="subtitle">Resultados locais com limites de recursos simulados.</p>
    <h2>Recomendação</h2><div class="panel">${recommendation}</div>
    <h2>Todos os resultados</h2>
    <div class="scroll"><table><thead><tr><th>Perfil</th><th>Cenário</th><th>Usuários</th><th>Req/s</th><th>Média</th><th>p95</th><th>p99</th><th>Erros</th><th>CPU pico</th><th>RAM pico</th><th>Banco</th><th>Avaliação</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted">Critérios: p95 &lt; 500 ms, erros &lt; 1%, verificações ≥ 99%, CPU abaixo de 70% e RAM abaixo de 80% para classificação saudável.</p>`,
  );
}

export async function generateComparisonReport() {
  const results = await findResults();
  await fs.mkdir(resultsDirectory, { recursive: true });
  const comparison = {
    generatedAt: new Date().toISOString(),
    results,
  };
  await Promise.all([
    fs.writeFile(
      path.join(resultsDirectory, 'comparison.json'),
      JSON.stringify(comparison, null, 2),
    ),
    fs.writeFile(
      path.join(resultsDirectory, 'comparison.html'),
      comparisonHtml(results),
    ),
  ]);
  return results;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const results = await generateComparisonReport();
  console.log(
    `Comparison report generated with ${results.length} result(s): ${path.join(resultsDirectory, 'comparison.html')}`,
  );
}
