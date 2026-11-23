import type { ResourceIdSegment } from '@radius-project/core/domain';
import type { ResourceList } from '../resources';

export interface RadiusQueryContext {
  readonly connectionId: string;
  readonly plane: ResourceIdSegment;
}

export interface RadiusQueryRequest extends RadiusQueryContext {
  readonly method: 'GET' | 'POST';
  /** UCP path including the API prefix and encoded api-version query. */
  readonly path: string;
  /** JSON request value; the host owns serialization and Content-Type. */
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

/** The host owns authentication, HTTP status errors, decoding and timeouts. */
export interface RadiusQueryPort {
  request<T>(request: RadiusQueryRequest): Promise<T>;
}

export interface QueryOptions {
  readonly signal?: AbortSignal;
}

export interface ResourceListOptions extends QueryOptions {
  readonly resourceType?: string;
  readonly resourceGroup?: string;
}

export interface QueryFailure {
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly error: unknown;
}

/** Partial inventory is explicit. All failed operations reject instead. */
export interface QueryResult<
  T = Record<string, unknown>,
> extends ResourceList<T> {
  readonly complete: boolean;
  readonly errors: readonly QueryFailure[];
}
