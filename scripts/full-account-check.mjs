const api = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1';
const mailpit = process.env.MAILPIT_API_URL ?? 'http://mailpit:8025';
const email = `integration-${Date.now()}@example.test`;
const firstPassword = 'Integration123!';
const newPassword = 'ChangedIntegration123!';

const request = (path, options = {}) => {
  const headers = { ...(options.headers ?? {}) };
  if (options.body && !(options.body instanceof FormData)) {
    headers['content-type'] ??= 'application/json';
  }
  return fetch(`${api}${path}`, {
    ...options,
    signal: AbortSignal.timeout(10_000),
    headers,
  });
};

const expectStatus = async (response, status, label) => {
  if (response.status !== status) {
    throw new Error(
      `${label}: expected ${status}, received ${response.status} ${await response.text()}`,
    );
  }
};

const waitForApi = async () => {
  let lastResult = 'unreachable';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await request('/health');
      if (response.status === 200) return;
      lastResult = `${response.status} ${await response.text()}`;
    } catch (error) {
      lastResult = error instanceof Error ? error.message : 'unreachable';
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`API did not become ready: ${lastResult}`);
};

const waitForToken = async (recipient, subject) => {
  let lastResult = 'message not found';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${mailpit}/api/v1/messages`, {
        signal: AbortSignal.timeout(5_000),
      });
      const result = response.ok ? await response.json() : {};
      const messages = result.messages ?? result.Messages ?? [];
      const message = messages.find((item) => {
        const value = JSON.stringify(item).toLowerCase();
        return (
          value.includes(recipient.toLowerCase()) &&
          value.includes(subject.toLowerCase())
        );
      });
      const id = message?.ID ?? message?.Id ?? message?.id;
      if (id) {
        const detailResponse = await fetch(
          `${mailpit}/api/v1/message/${encodeURIComponent(id)}`,
          { signal: AbortSignal.timeout(5_000) },
        );
        const detail = detailResponse.ok ? await detailResponse.json() : {};
        const content = [detail.Text, detail.HTML, detail.text, detail.html]
          .filter(Boolean)
          .join('\n')
          .replaceAll('&amp;', '&');
        const token = content.match(/[?&]token=([^\s&"'<>]+)/)?.[1];
        if (token) return decodeURIComponent(token);
        lastResult = `${subject} did not contain a token`;
      }
    } catch (error) {
      lastResult =
        error instanceof Error ? error.message : 'Mailpit unavailable';
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Mailpit lookup failed: ${lastResult}`);
};

const login = async (loginEmail, password, label) => {
  const response = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: loginEmail, password }),
  });
  await expectStatus(response, 200, label);
  const body = await response.json();
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie || !body.data?.accessToken || !body.data?.user?.id) {
    throw new Error(`${label}: credentials were not returned`);
  }
  return { body, cookie };
};

await waitForApi();

const register = await request('/auth/register', {
  method: 'POST',
  body: JSON.stringify({ email, password: firstPassword }),
});
await expectStatus(register, 201, 'register');
const userId = (await register.json()).data?.id;
if (!userId) throw new Error('register: user id was not returned');

const unverifiedLogin = await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password: firstPassword }),
});
await expectStatus(unverifiedLogin, 403, 'unverified login');

const verificationToken = await waitForToken(email, 'Confirme seu e-mail');
await expectStatus(
  await request('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token: verificationToken }),
  }),
  204,
  'verify email',
);
await expectStatus(
  await request('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token: verificationToken }),
  }),
  400,
  'verification token reuse',
);

await expectStatus(
  await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: firstPassword }),
  }),
  403,
  'login pending approval',
);

const admin = await login(
  process.env.SEED_ADMIN_EMAIL,
  process.env.SEED_ADMIN_PASSWORD,
  'admin login',
);
const adminAuth = { authorization: `Bearer ${admin.body.data.accessToken}` };

await expectStatus(
  await request(`/users/${userId}/approval`, {
    method: 'PUT',
    headers: adminAuth,
    body: JSON.stringify({ status: 'REJECTED' }),
  }),
  200,
  'reject registration',
);
await expectStatus(
  await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: firstPassword }),
  }),
  403,
  'login rejected registration',
);
await expectStatus(
  await request(`/users/${userId}/approval`, {
    method: 'PUT',
    headers: adminAuth,
    body: JSON.stringify({ status: 'APPROVED' }),
  }),
  200,
  'reconsider registration',
);

const firstSession = await login(email, firstPassword, 'verified login');
const refresh = await request('/auth/refresh', {
  method: 'POST',
  headers: { cookie: firstSession.cookie },
});
await expectStatus(refresh, 200, 'refresh');
const refreshBody = await refresh.json();
const activeCookie = refresh.headers.get('set-cookie')?.split(';')[0];
if (!activeCookie || !refreshBody.data?.accessToken) {
  throw new Error('refresh: rotated credentials were not returned');
}
await expectStatus(
  await request('/auth/refresh', {
    method: 'POST',
    headers: { cookie: firstSession.cookie },
  }),
  401,
  'rotated token reuse',
);

await expectStatus(
  await request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }),
  204,
  'forgot password',
);
const resetToken = await waitForToken(email, 'Redefina sua senha');
await expectStatus(
  await request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token: resetToken, password: newPassword }),
  }),
  204,
  'reset password',
);
await expectStatus(
  await request('/auth/refresh', {
    method: 'POST',
    headers: { cookie: activeCookie },
  }),
  401,
  'session revoked by password reset',
);
await expectStatus(
  await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: firstPassword }),
  }),
  401,
  'old password',
);

const userSession = await login(email, newPassword, 'new password login');
const userAuth = {
  authorization: `Bearer ${userSession.body.data.accessToken}`,
};
await expectStatus(
  await request('/users/me', { headers: userAuth }),
  200,
  'current user',
);

await expectStatus(
  await request('/rbac/permissions', { headers: adminAuth }),
  200,
  'rbac',
);
await expectStatus(
  await request('/rbac/roles', { headers: adminAuth }),
  200,
  'roles available for assignment',
);

const catalogSuffix = Date.now();
const categorySlug = `integration-category-${catalogSuffix}`;
const productSlug = `integration-product-${catalogSuffix}`;
const categoryResponse = await request('/admin/categories', {
  method: 'POST',
  headers: adminAuth,
  body: JSON.stringify({
    name: `Integration Category ${catalogSuffix}`,
    slug: categorySlug,
  }),
});
await expectStatus(categoryResponse, 201, 'create category');
const categoryId = (await categoryResponse.json()).data?.id;
if (!categoryId) throw new Error('create category: id was not returned');

const productResponse = await request('/admin/products', {
  method: 'POST',
  headers: adminAuth,
  body: JSON.stringify({
    name: `Integration Product ${catalogSuffix}`,
    slug: productSlug,
    sku: `INTEGRATION-${catalogSuffix}`,
    price: '99.90',
    showPrice: true,
    specifications: { source: 'integration-check' },
    categories: [{ categoryId, sortOrder: 0 }],
  }),
});
await expectStatus(productResponse, 201, 'create product');
const productId = (await productResponse.json()).data?.id;
if (!productId) throw new Error('create product: id was not returned');

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const uploadImage = async (name, altText) => {
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), name);
  form.append('altText', altText);
  const response = await request(`/admin/products/${productId}/images`, {
    method: 'POST',
    headers: adminAuth,
    body: form,
  });
  await expectStatus(response, 201, `upload ${name}`);
  const id = (await response.json()).data?.id;
  if (!id) throw new Error(`upload ${name}: id was not returned`);
  return id;
};
const firstImageId = await uploadImage(
  'integration-front.png',
  'Vista frontal',
);
const secondImageId = await uploadImage(
  'integration-side.png',
  'Vista lateral',
);

await expectStatus(
  await request(`/admin/products/${productId}/images/order`, {
    method: 'PATCH',
    headers: adminAuth,
    body: JSON.stringify({
      images: [
        { id: secondImageId, altText: 'Vista lateral principal' },
        { id: firstImageId, altText: 'Vista frontal adicional' },
      ],
    }),
  }),
  200,
  'reorder product images',
);
await expectStatus(
  await request(
    `/admin/products/${productId}/images/${secondImageId}/content`,
    { headers: adminAuth },
  ),
  200,
  'admin image preview',
);

await expectStatus(
  await request(`/products/${productSlug}`),
  404,
  'draft product is private',
);
await expectStatus(
  await request(`/admin/products/${productId}/status`, {
    method: 'PATCH',
    headers: adminAuth,
    body: JSON.stringify({ status: 'PUBLISHED' }),
  }),
  200,
  'publish product',
);
await expectStatus(
  await request(`/products/${productSlug}`),
  200,
  'published product detail',
);
await expectStatus(
  await request(`/product-images/${secondImageId}`),
  200,
  'published product image',
);
await expectStatus(
  await request(`/admin/products/${productId}/images/${secondImageId}`, {
    method: 'DELETE',
    headers: adminAuth,
  }),
  200,
  'delete primary product image',
);
const productAfterImageDelete = await request(`/admin/products/${productId}`, {
  headers: adminAuth,
});
await expectStatus(productAfterImageDelete, 200, 'product after image delete');
const remainingImages = (await productAfterImageDelete.json()).data?.images;
if (
  remainingImages?.length !== 1 ||
  remainingImages[0].id !== firstImageId ||
  !remainingImages[0].isPrimary ||
  remainingImages[0].sortOrder !== 0
) {
  throw new Error('delete primary image: next image was not promoted');
}
await expectStatus(
  await request(`/admin/products/${productId}/images/${firstImageId}`, {
    method: 'DELETE',
    headers: adminAuth,
  }),
  200,
  'delete remaining product image',
);
await expectStatus(
  await request(`/products?category=${categorySlug}`),
  200,
  'published products by category',
);
await expectStatus(
  await request(`/admin/products/${productId}`, {
    method: 'DELETE',
    headers: adminAuth,
  }),
  200,
  'archive product',
);
await expectStatus(
  await request(`/products/${productSlug}`),
  404,
  'archived product is private',
);
await expectStatus(
  await request(`/admin/categories/${categoryId}`, {
    method: 'DELETE',
    headers: adminAuth,
  }),
  200,
  'deactivate category in use',
);

const audit = await request(
  '/audit-logs?action=AUTH_PASSWORD_RESET_COMPLETED&status=SUCCESS&limit=20',
  { headers: adminAuth },
);
await expectStatus(audit, 200, 'audit');
if (!(await audit.json()).data?.some((entry) => entry.resourceId === userId)) {
  throw new Error('audit: password reset event was not found');
}

const imageAudit = await request(
  `/audit-logs?action=PRODUCT_IMAGE_DELETED&actorEmail=${encodeURIComponent(process.env.SEED_ADMIN_EMAIL)}&limit=20`,
  { headers: adminAuth },
);
await expectStatus(imageAudit, 200, 'image audit filtered by actor email');
if (
  !(await imageAudit.json()).data?.some(
    (entry) => entry.actor?.email === process.env.SEED_ADMIN_EMAIL,
  )
) {
  throw new Error('audit: image event with actor email was not found');
}

await expectStatus(
  await request('/auth/logout', {
    method: 'POST',
    headers: { ...userAuth, cookie: userSession.cookie },
  }),
  204,
  'logout',
);
await expectStatus(
  await request('/auth/refresh', {
    method: 'POST',
    headers: { cookie: userSession.cookie },
  }),
  401,
  'refresh after logout',
);

const blockedEmail = `rate-limit-${Date.now()}@example.invalid`;
for (let attempt = 1; attempt <= 5; attempt += 1) {
  await expectStatus(
    await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: blockedEmail,
        password: 'invalid-password',
      }),
    }),
    401,
    `invalid login ${attempt}`,
  );
}
await expectStatus(
  await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: blockedEmail, password: 'invalid-password' }),
  }),
  429,
  'progressive lock',
);

console.log('Full account integration checks passed');
