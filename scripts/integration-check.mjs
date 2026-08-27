const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1';

const request = (path, options = {}) =>
  fetch(`${baseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(5_000),
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

const assertStatus = (response, expected, label) => {
  if (response.status !== expected) {
    throw new Error(
      `${label}: expected ${expected}, received ${response.status}`,
    );
  }
};

const waitForHealth = async () => {
  let lastStatus = 'unreachable';
  let lastBody = '';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await request('/health');
      if (response.status === 200) return;
      lastStatus = response.status;
      lastBody = await response.text();
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : 'unreachable';
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`health did not become ready: ${lastStatus} ${lastBody}`);
};

await waitForHealth();

const login = await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
  }),
});
assertStatus(login, 200, 'login');
const loginBody = await login.json();
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie || !loginBody.data?.accessToken)
  throw new Error('login did not return credentials');

const refresh = await request('/auth/refresh', {
  method: 'POST',
  headers: { cookie },
});
assertStatus(refresh, 200, 'refresh');
const refreshBody = await refresh.json();
const refreshedCookie =
  refresh.headers.get('set-cookie')?.split(';')[0] ?? cookie;
const authorization = {
  authorization: `Bearer ${refreshBody.data.accessToken}`,
};

assertStatus(
  await request('/rbac/permissions', { headers: authorization }),
  200,
  'rbac',
);
assertStatus(
  await request('/audit-logs?status=SUCCESS&limit=5', {
    headers: authorization,
  }),
  200,
  'audit',
);
assertStatus(
  await request('/auth/logout', {
    method: 'POST',
    headers: { ...authorization, cookie: refreshedCookie },
  }),
  204,
  'logout',
);

const email = `rate-limit-${Date.now()}@example.invalid`;
for (let attempt = 0; attempt < 5; attempt += 1) {
  assertStatus(
    await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'invalid-password' }),
    }),
    401,
    `invalid login ${attempt + 1}`,
  );
}
assertStatus(
  await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'invalid-password' }),
  }),
  429,
  'progressive lock',
);

console.log('Integration checks passed');
