export interface ClientConfig {
  readonly baseUrl: string;
  readonly token?: string;
  readonly timeoutMs?: number;
  readonly fetcher?: Fetcher;
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface RequestOptions extends RequestInit {
  readonly authenticated?: boolean;
  readonly retries?: number;
  readonly timeoutMs?: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetcher: Fetcher;

  constructor(config: ClientConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.token = config.token;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.fetcher = config.fetcher ?? ((input, init) => fetch(input, init));
  }

  withToken(token: string): ApiClient {
    return new ApiClient({ baseUrl: this.baseUrl, token, timeoutMs: this.timeoutMs, fetcher: this.fetcher });
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const retries = options.retries ?? (options.method === undefined || options.method === 'GET' ? 1 : 0);
    let attempt = 0;
    while (true) {
      try {
        return await this.once<T>(path, options);
      } catch (error) {
        if (!(error instanceof ApiError) || !error.retryable || attempt >= retries) throw error;
        attempt += 1;
      }
    }
  }

  private async once<T>(path: string, options: RequestOptions): Promise<T> {
    const {
      authenticated = true,
      timeoutMs = this.timeoutMs,
      ...requestInit
    } = options;
    delete requestInit.retries;
    const headers = new Headers(requestInit.headers);
    if (requestInit.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (authenticated) {
      if (!this.token) throw new ApiError('Pair this phone before using PocketPilot.', 401, false);
      headers.set('Authorization', `Bearer ${this.token}`);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, { ...requestInit, headers, signal: controller.signal });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new ApiError(detailFrom(payload) ?? `Request failed (${response.status}).`, response.status, response.status >= 500 || response.status === 429);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const timeoutMessage = error instanceof Error && error.name === 'AbortError';
      throw new ApiError(timeoutMessage ? 'The laptop did not respond in time.' : 'Laptop not reachable. Check the address and Wi-Fi network.', null, true);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, '');
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(withScheme);
  if (!['http:', 'https:'].includes(url.protocol)) throw new ApiError('Use an HTTP or HTTPS laptop address.', null, false);
  return url.toString().replace(/\/$/, '');
}

function detailFrom(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('detail' in value)) return null;
  const detail = value.detail;
  if (typeof detail === 'string') return detail;
  if (typeof detail === 'object' && detail !== null && 'message' in detail && typeof detail.message === 'string') return detail.message;
  return null;
}
