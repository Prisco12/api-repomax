export const thresholds = {
  checks: ['rate>=0.99'],
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<500'],
};

export const commonOptions = {
  thresholds,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  userAgent: 'RepoMax-k6-performance-suite/1.0',
};

export function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
