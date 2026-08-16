/**
 * Standard HTTP client for API calls.
 *
 * Thin, typed wrapper around `axios` with sensible defaults (JSON, timeout,
 * logging). Use it for any outbound API call in the framework (e.g. smoke report
 * delivery, backend probes) so call sites stay consistent and don't reinvent
 * request/error handling.
 *
 *   const api = HttpClient.getInstance({ baseURL: "https://api.example.com" });
 *   const res = await api.get<MyDto>("/health");
 *
 * The instance is created lazily and cached per config, so repeated
 * `getInstance` calls with the same options reuse the underlying axios instance.
 */
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse, Method } from "axios";
import { Logger } from "./logger";

const logger = Logger.getInstance();

export interface HttpClientOptions {
  /** Base URL prepended to relative request paths. */
  baseURL?: string;
  /** Default request timeout in ms (default 10000). */
  timeoutMs?: number;
  /** Default headers merged into every request. */
  defaultHeaders?: Record<string, string>;
  /** When true, log every request/response at debug level. */
  logRequests?: boolean;
}

export class HttpClient {
  private static instances = new Map<string, HttpClient>();
  private readonly client: AxiosInstance;
  private readonly logRequests: boolean;

  private constructor(opts: HttpClientOptions) {
    this.logRequests = opts.logRequests ?? false;
    this.client = axios.create({
      baseURL: opts.baseURL,
      timeout: opts.timeoutMs ?? 10000,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(opts.defaultHeaders ?? {}),
      },
    });

    // Attach interceptors only when request logging is enabled, to avoid overhead otherwise.
    if (this.logRequests) {
      this.client.interceptors.request.use((config) => {
        logger.debug(`HttpClient → ${config.method?.toUpperCase()} ${this.describe(config)}`);
        return config;
      });
      this.client.interceptors.response.use(
        (res) => {
          logger.debug(`HttpClient ← ${res.status} ${this.describe(res.config)}`);
          return res;
        },
        (err: AxiosError) => {
          logger.warn(`HttpClient ✗ ${err.response?.status ?? "?"} ${this.describe(err.config)}`);
          return Promise.reject(err);
        }
      );
    }
  }

  /** Get (or create) a cached client for the given options. */
  static getInstance(opts: HttpClientOptions = {}): HttpClient {
    const key = JSON.stringify({
      baseURL: opts.baseURL ?? "",
      timeoutMs: opts.timeoutMs ?? 10000,
      defaultHeaders: opts.defaultHeaders ?? {},
      logRequests: opts.logRequests ?? false,
    });
    let existing = HttpClient.instances.get(key);
    if (!existing) {
      existing = new HttpClient(opts);
      HttpClient.instances.set(key, existing);
    }
    return existing;
  }

  /** Reset the instance cache (primarily for tests). */
  static reset(): void {
    HttpClient.instances.clear();
  }

  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>("GET", url, config);
  }

  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>("POST", url, config, data);
  }

  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>("PUT", url, config, data);
  }

  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>("PATCH", url, config, data);
  }

  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>("DELETE", url, config);
  }

  /** Core request method shared by the verb helpers. Throws AxiosError on non-2xx. */
  async request<T = unknown>(
    method: Method,
    url: string,
    config?: AxiosRequestConfig,
    data?: unknown
  ): Promise<AxiosResponse<T>> {
    return this.client.request<T>({ method, url, data, ...config });
  }

  /** Resolve a short descriptor for logging without leaking bodies. */
  private describe(config?: AxiosRequestConfig): string {
    const base = this.client.defaults.baseURL ?? "";
    return `${base}${config?.url ?? ""}`;
  }
}
