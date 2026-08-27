import { context, trace } from '@opentelemetry/api';

export function traceLogContext() {
  const spanContext = trace.getSpan(context.active())?.spanContext();
  return spanContext
    ? { traceId: spanContext.traceId, spanId: spanContext.spanId }
    : {};
}
