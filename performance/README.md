# Performance tests

This suite runs [Grafana k6](https://grafana.com/docs/k6/latest/) in Docker,
samples CPU and memory from the Caddy/frontend, API, PostgreSQL, Redis,
Prometheus, Grafana, Loki, Tempo and Alloy containers, and builds individual
and comparative HTML reports.

It is a local capacity estimate. CPU model, disk latency, network and resource
sharing on the real VPS will differ, so repeat the same tests on the chosen VPS
before production.

## Requirements

- Docker Desktop running with at least 4 CPUs and 8 GB of memory assigned when
  testing the medium profile.
- A valid `.env` based on `.env.example`.
- Free local ports `PORT` for direct API access (default: `3000`) and
  `PERF_HTTP_PORT` for Caddy/frontend (default: `8080`).

The runner starts PostgreSQL, Redis, Mailpit and the complete observability
stack, builds the API and frontend, applies Prisma migrations and runs the
existing idempotent seeds before generating load. k6 calls
`http://localhost:8080/api/v1` through Caddy, matching the same-origin route
intended for the VPS. It does not delete the development database when it
finishes.

The performance Compose profiles raise `RATE_LIMIT_MAX` to `1000000` only in
the test containers. k6 originates from one IP, so the normal per-IP limit of
100 requests per minute would measure `429 Too Many Requests` responses instead
of API capacity. The regular development and production configurations remain
unchanged. Use a separate functional test to validate throttling behavior.

## Commands

Create the realistic dataset before comparing VPS profiles:

```powershell
npm run perf:seed -- --products=10000 --categories=100
```

The seed is idempotent and creates records with reserved `repomax-perf-*` slugs
and `PERF-*` SKUs. It generates 70% published, 20% draft and 10% archived
products, two to five category relationships per product and two image metadata
rows for 30% of products. Image metadata exercises product relations and list
payloads; it does not upload synthetic binary files to local storage or S3.

Remove only the generated performance records:

```powershell
npm run perf:cleanup
```

Run a short connectivity and authentication check against the small profile:

```powershell
npm run perf:smoke
```

Run the normal workload against each VPS profile:

```powershell
npm run perf:load:small
npm run perf:load:medium
```

Run the stress scenario only after the normal workload is stable:

```powershell
npm run perf:stress:small
npm run perf:stress:medium
```

Run smoke plus both normal workload profiles sequentially:

```powershell
npm run perf:all
```

After a scenario leaves the stack running, create a temporary PostgreSQL backup
while continuously checking API readiness:

```powershell
npm run perf:backup-check
```

The check reports backup size, readiness failures and worst readiness latency,
then removes the temporary dump from the database container. This verifies
coexistence with a local backup operation; production restores still need to be
tested separately on a disposable database.

Rebuild the comparison from existing results without running k6:

```powershell
npm run perf:report
```

Generated reports are stored at:

```text
performance/results/<profile>/<scenario>/report.html
performance/results/comparison.html
```

The raw `k6-summary.json`, `resources.json`, `metadata.json` and `result.json`
files remain beside every individual report for inspection.

Every individual report contains:

- CPU and RAM for Caddy/frontend, API, PostgreSQL, Redis, Prometheus, Grafana,
  Loki, Tempo and Alloy;
- CPU after the load and memory growth from first to last sample;
- PostgreSQL database, table and index sizes;
- PostgreSQL connections and configured maximum;
- frontend build, application and observability persistent volumes, and current
  service image sizes;
- configured Docker log ceiling;
- local host disk use with warning at 70% and critical state at 85%;
- API readiness immediately after the load.

## Workload

Every virtual user accesses public product lists, product searches and category
lists through Caddy. Searches rotate between product name, SKU and slug terms.
When `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are available, setup
authenticates once and the same users also access administrative product lists,
searches and category lists. Successful login is not repeated during the
measured workload.

Set `PERF_PRODUCT_SLUG` to include a published product detail in every iteration:

```powershell
$env:PERF_PRODUCT_SLUG = 'published-product-slug'
npm run perf:load:small
```

Remove it afterwards if needed:

```powershell
Remove-Item Env:PERF_PRODUCT_SLUG
```

## Default scenarios

- `smoke`: 2 users for 30 seconds.
- `load`: ramps through 10, 25 and 50 users in approximately 7 minutes.
- `stress`: ramps through 50, 100 and 200 users in approximately 10 minutes.

Durations and user counts can be changed without editing source files. For
example, a quick load validation can use:

```powershell
$env:PERF_LOAD_INITIAL_VUS = '2'
$env:PERF_LOAD_NORMAL_VUS = '5'
$env:PERF_LOAD_PEAK_VUS = '10'
$env:PERF_LOAD_INITIAL_DURATION = '15s'
$env:PERF_LOAD_NORMAL_DURATION = '30s'
$env:PERF_LOAD_PEAK_DURATION = '30s'
$env:PERF_LOAD_RAMP_DURATION = '10s'
$env:PERF_LOAD_NORMAL_RAMP_DURATION = '10s'
$env:PERF_LOAD_PEAK_RAMP_DURATION = '10s'
$env:PERF_LOAD_COOLDOWN_DURATION = '10s'
npm run perf:load:small
```

## Existing or remote environment

To avoid rebuilding the local stack and test an already running compatible
environment, provide its base URL and skip stack preparation:

```powershell
$env:PERF_BASE_URL = 'https://staging.example.com/api/v1'
$env:PERF_NO_START = 'true'
npm run perf:load:small
```

Resource collection still expects the local Compose containers. For a remote
VPS, execute the runner on that VPS so Docker metrics refer to the tested host.
Never execute stress tests against production without an approved maintenance
window.

## Evaluation

A result is considered healthy when all these conditions have margin:

- p95 latency below 500 ms;
- request errors below 1%;
- checks at or above 99%;
- normalized allocated CPU below 70%;
- total tracked memory below 80% of the simulated VPS.

The report marks a profile as `No limite` before saturation and explains which
metric caused the classification. Local results compare profiles, but do not
guarantee identical capacity at a hosting provider.

To stop the stack without deleting PostgreSQL data:

```powershell
docker compose -f docker-compose.yml -f docker-compose.performance.yml -f docker-compose.observability.yml -f docker-compose.performance-small.yml down
```
