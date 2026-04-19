import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getActiveTraceIds, injectTraceContext, runWithExtractedContext } from '../propagation.ts';
import { withSpan } from '../tracer.ts';

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  resource: resourceFromAttributes({ 'service.name': 'test' }),
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});

const contextManager = new AsyncHooksContextManager().enable();

beforeAll(() => {
  context.setGlobalContextManager(contextManager);
  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
});

afterAll(async () => {
  await provider.shutdown();
});

afterEach(() => {
  exporter.reset();
});

describe('withSpan', () => {
  it('records a successful span with attributes', async () => {
    const result = await withSpan('test.op', { attributes: { 'session.id': 's1' } }, (span) => {
      span.setAttribute('messages.count', 3);
      return Promise.resolve(42);
    });

    expect(result).toBe(42);
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const span = spans[0];
    expect(span?.name).toBe('test.op');
    expect(span?.status.code).toBe(1);
    expect(span?.attributes['session.id']).toBe('s1');
    expect(span?.attributes['messages.count']).toBe(3);
  });

  it('records exception and rethrows', async () => {
    await expect(
      withSpan('test.fail', {}, () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.status.code).toBe(2);
    expect(spans[0]?.events.some((e) => e.name === 'exception')).toBe(true);
  });
});

describe('propagation', () => {
  it('injects and extracts w3c trace context across a "process boundary"', async () => {
    let carrier: Record<string, string> = {};
    let childTraceId = '';

    await withSpan('parent', {}, (): Promise<void> => {
      carrier = injectTraceContext();
      expect(carrier['traceparent']).toBeDefined();

      const ids = getActiveTraceIds();
      expect(ids).toBeDefined();

      runWithExtractedContext(carrier, () => {
        const extracted = getActiveTraceIds();
        expect(extracted?.traceId).toBe(ids?.traceId);
      });
      return Promise.resolve();
    });

    const parentSpan = exporter.getFinishedSpans()[0];
    expect(parentSpan).toBeDefined();

    runWithExtractedContext(carrier, () => {
      const tracer = trace.getTracer('test');
      const child = tracer.startSpan('child');
      childTraceId = child.spanContext().traceId;
      child.end();
    });

    expect(childTraceId).toBe(parentSpan?.spanContext().traceId);
  });

  it('runs noop when carrier is empty', () => {
    const ran = runWithExtractedContext({}, () => {
      return trace.getSpan(context.active());
    });
    expect(ran).toBeUndefined();
  });
});
