# Performance tests

This suite runs [Grafana k6](https://grafana.com/docs/k6/latest/) in Docker,
samples CPU and memory from the API, PostgreSQL and Redis containers, and builds
individual and comparative HTML reports.

It is a local capacity estimate. CPU model, disk latency, network and resource
sharing on the real VPS will differ, so repeat the same tests on the chosen VPS
before production.

## Requirements

- Docker Desktop running with at least 4 CPUs and 8 GB of memory assigned when
  testing the medium profile.
- A valid `.env` based on `.env.example`.
- Free local port configured by `PORT` (default: `3000`).

The runner starts PostgreSQL, Redis and Mailpit, builds the API, applies Prisma
migrations and runs the existing idempotent seeds before generating load. It
does not delete the development database when it finishes.

## Commands

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

## Workload

Every virtual user accesses the public product and category lists. When
`SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are available, setup authenticates
once and the same users also access the administrative product and category
lists. Successful login is not repeated during the measured workload.

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
docker compose -f docker-compose.yml -f docker-compose.performance-small.yml down
```
