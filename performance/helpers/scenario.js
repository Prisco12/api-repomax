import http from 'k6/http';
import { check, fail, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const routeDuration = {
  publicProducts: new Trend('route_public_products_duration', true),
  publicSearchName: new Trend('route_public_search_name_duration', true),
  publicSearchSku: new Trend('route_public_search_sku_duration', true),
  publicSearchSlug: new Trend('route_public_search_slug_duration', true),
  publicCategories: new Trend('route_public_categories_duration', true),
  adminProducts: new Trend('route_admin_products_duration', true),
  adminSearchName: new Trend('route_admin_search_name_duration', true),
  adminSearchSku: new Trend('route_admin_search_sku_duration', true),
  adminSearchSlug: new Trend('route_admin_search_slug_duration', true),
  adminCategories: new Trend('route_admin_categories_duration', true),
};

const baseUrl = (
  __ENV.API_BASE_URL || 'http://host.docker.internal:3000/api/v1'
).replace(/\/$/, '');
const requestTimeout = __ENV.PERF_REQUEST_TIMEOUT || '10s';

function jsonHeaders(token) {
  return {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    timeout: requestTimeout,
  };
}

function expectOk(response, label) {
  check(response, {
    [`${label}: status 200`]: (result) => result.status === 200,
  });
}

function recordDuration(response, trend) {
  trend.add(response.timings.duration);
  return response;
}

export function setupSession() {
  const health = http.get(`${baseUrl}/health/ready`, {
    timeout: requestTimeout,
    tags: { name: 'GET /health/ready' },
  });
  if (health.status !== 200) {
    fail(`API is not ready: received HTTP ${health.status}`);
  }

  const email = __ENV.SEED_ADMIN_EMAIL;
  const password = __ENV.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn(
      'SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD were not provided; admin endpoints will be skipped.',
    );
    return { accessToken: null };
  }

  const login = http.post(
    `${baseUrl}/auth/login`,
    JSON.stringify({ email, password }),
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: requestTimeout,
      tags: { name: 'POST /auth/login [setup]' },
    },
  );
  if (login.status !== 200) {
    fail(`Admin login failed during setup: received HTTP ${login.status}`);
  }

  const token = login.json('data.accessToken');
  if (!token) fail('Admin login did not return data.accessToken');
  return { accessToken: token };
}

export function runScenario(data) {
  const page = ((__VU + __ITER) % 5) + 1;
  const searchTerms = [
    { kind: 'Name', value: 'Performance Product' },
    { kind: 'Sku', value: 'PERF-000' },
    { kind: 'Slug', value: 'repomax-perf-product' },
  ];
  const search = searchTerms[(__VU + __ITER) % searchTerms.length];
  const publicParams = {
    timeout: requestTimeout,
    tags: { name: 'GET /products' },
  };

  group('public catalog', () => {
    const products = recordDuration(
      http.get(`${baseUrl}/products?page=${page}&limit=20`, publicParams),
      routeDuration.publicProducts,
    );
    expectOk(products, 'public products');

    const productSearch = recordDuration(
      http.get(
        `${baseUrl}/products?search=${encodeURIComponent(search.value)}&limit=20`,
        {
          timeout: requestTimeout,
          tags: { name: 'GET /products?search' },
        },
      ),
      routeDuration[`publicSearch${search.kind}`],
    );
    expectOk(productSearch, 'public product search');

    const categories = recordDuration(
      http.get(`${baseUrl}/categories`, {
        timeout: requestTimeout,
        tags: { name: 'GET /categories' },
      }),
      routeDuration.publicCategories,
    );
    expectOk(categories, 'public categories');

    if (__ENV.PERF_PRODUCT_SLUG) {
      const product = http.get(
        `${baseUrl}/products/${encodeURIComponent(__ENV.PERF_PRODUCT_SLUG)}`,
        {
          timeout: requestTimeout,
          tags: { name: 'GET /products/:slug' },
        },
      );
      expectOk(product, 'public product detail');
    }
  });

  if (data?.accessToken) {
    group('administration', () => {
      const products = recordDuration(
        http.get(`${baseUrl}/admin/products?page=${page}&limit=20`, {
          ...jsonHeaders(data.accessToken),
          tags: { name: 'GET /admin/products' },
        }),
        routeDuration.adminProducts,
      );
      expectOk(products, 'admin products');

      const productSearch = recordDuration(
        http.get(
          `${baseUrl}/admin/products?search=${encodeURIComponent(search.value)}&limit=20`,
          {
            ...jsonHeaders(data.accessToken),
            tags: { name: 'GET /admin/products?search' },
          },
        ),
        routeDuration[`adminSearch${search.kind}`],
      );
      expectOk(productSearch, 'admin product search');

      const categories = recordDuration(
        http.get(`${baseUrl}/admin/categories`, {
          ...jsonHeaders(data.accessToken),
          tags: { name: 'GET /admin/categories' },
        }),
        routeDuration.adminCategories,
      );
      expectOk(categories, 'admin categories');
    });
  }

  const pause = Number(__ENV.PERF_SLEEP_SECONDS || 1);
  sleep(Number.isFinite(pause) && pause >= 0 ? pause : 1);
}

export function summaryOutput(data) {
  const duration = data.metrics.http_req_duration?.values || {};
  const failed = data.metrics.http_req_failed?.values?.rate || 0;
  const requests = data.metrics.http_reqs?.values || {};
  const checks = data.metrics.checks?.values?.rate || 0;
  const text = [
    '',
    'RepoMax performance summary',
    `Requests: ${Math.round(requests.count || 0)} (${(requests.rate || 0).toFixed(2)}/s)`,
    `Latency: avg ${(duration.avg || 0).toFixed(2)} ms | p95 ${(duration['p(95)'] || 0).toFixed(2)} ms | p99 ${(duration['p(99)'] || 0).toFixed(2)} ms`,
    `Errors: ${(failed * 100).toFixed(2)}% | Checks: ${(checks * 100).toFixed(2)}%`,
    '',
  ].join('\n');

  const safeData = {
    ...data,
    setup_data: data.setup_data?.accessToken
      ? { accessToken: '[REDACTED]' }
      : data.setup_data,
  };

  return {
    '/results/k6-summary.json': JSON.stringify(safeData, null, 2),
    stdout: text,
  };
}
