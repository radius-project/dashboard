import { parseResourceId } from '@radius-project/core/domain';
import type { RadiusQueryContext, RadiusQueryPort } from './queryContracts';

export const defaultApiVersion = '2023-10-01-preview';

export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function segment(value: string): string {
  if (
    !value ||
    // eslint-disable-next-line no-control-regex -- Control characters are invalid in UCP path segments.
    /[/\\?#\s\u0000-\u001f]/.test(value) ||
    value === '.' ||
    value === '..'
  ) {
    throw new TypeError(
      'Radius query path segment must be non-empty and unambiguous.',
    );
  }
  return encodeURIComponent(value);
}

/** One client-wide request budget, including discovery and nested inventory. */
export class QuerySession {
  readonly context: RadiusQueryContext;
  readonly planePath: string;
  private active = 0;
  private readonly waiting = new Set<() => void>();

  constructor(
    private readonly port: RadiusQueryPort,
    context: RadiusQueryContext,
    private readonly concurrency: number,
  ) {
    if (!context.connectionId.trim())
      throw new TypeError('Radius connectionId is required.');
    if (
      !Number.isSafeInteger(concurrency) ||
      concurrency < 1 ||
      concurrency > 32
    ) {
      throw new RangeError(
        'Radius query concurrency must be an integer from 1 to 32.',
      );
    }
    this.context = { ...context, plane: { ...context.plane } };
    this.planePath = `/planes/${segment(context.plane.type)}/${segment(context.plane.name)}`;
  }

  resource(id: string) {
    const parsed = parseResourceId(id);
    if (
      !parsed?.plane ||
      parsed.plane.type.toLowerCase() !==
        this.context.plane.type.toLowerCase() ||
      parsed.plane.name.toLowerCase() !== this.context.plane.name.toLowerCase()
    ) {
      throw new TypeError('Radius resource must be on the selected plane.');
    }
    return parsed;
  }

  async request<T>(
    path: string,
    version: string,
    signal?: AbortSignal,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown,
  ): Promise<T> {
    signal?.throwIfAborted();
    while (this.active >= this.concurrency) {
      await new Promise<void>((resolve, reject) => {
        const waiting = this.waiting;
        function ready() {
          waiting.delete(ready);
          signal?.removeEventListener('abort', aborted);
          resolve();
        }
        function aborted() {
          waiting.delete(ready);
          signal?.removeEventListener('abort', aborted);
          reject(signal?.reason);
        }
        waiting.add(ready);
        signal?.addEventListener('abort', aborted, { once: true });
      });
      signal?.throwIfAborted();
    }
    this.active++;
    try {
      const result = await this.port.request<T>({
        ...this.context,
        plane: { ...this.context.plane },
        method,
        ...(body === undefined ? {} : { body }),
        path: `/apis/api.ucp.dev/v1alpha3${path}?api-version=${encodeURIComponent(version)}`,
        signal,
      });
      signal?.throwIfAborted();
      return result;
    } finally {
      this.active--;
      this.waiting.values().next().value?.();
    }
  }
}
