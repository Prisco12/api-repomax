import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  context: RequestContext,
  callback: () => T,
): T {
  return storage.run(context, callback);
}

export function getRequestContext() {
  return storage.getStore();
}
