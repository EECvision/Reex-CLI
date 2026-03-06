// @internal — No changes needed
/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, {
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosError,
  AxiosRequestConfig,
} from "axios";
import { baseURL } from "./constants";

const API_TIMEOUT = 30000;
const REFRESH_TIMEOUT = 10000;

/** Pluggable authentication strategy */
export interface TokenProvider {
  /** Get current access token */
  getToken: () => Promise<string | null> | string | null;

  /** Refresh expired token */
  refreshToken?: () => Promise<string | null>;

  /** Return custom headers to inject into all requests */
  getCustomHeaders?: () =>
    | Promise<Record<string, string>>
    | Record<string, string>;

  /** Replace custom headers for all future requests */
  setCustomHeaders?: (headers: Record<string, string>) => void;
}

/** Standardized API error response */
export interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
  originalError?: unknown;
}

const DEFAULT_CONFIG: AxiosRequestConfig = {
  baseURL: baseURL,
  timeout: API_TIMEOUT,
  headers: { "Content-Type": "application/json" },
};

/** Creates an Axios client with auto token injection and 401 refresh/retry */
export const createApiClient = (
  tokenProvider?: TokenProvider,
): AxiosInstance => {
  const client = axios.create(DEFAULT_CONFIG);

  let isRefreshing = false;
  let failedQueue: Array<{
    resolve: (token: string | null) => void;
    reject: (error: any) => void;
  }> = [];

  const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach((prom) => {
      if (error) {
        prom.reject(error);
      } else {
        prom.resolve(token);
      }
    });
    failedQueue = [];
  };

  // Request interceptor: inject token + custom headers
  client.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      if (tokenProvider) {
        const token = await tokenProvider.getToken();
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        const customHeaders = await tokenProvider.getCustomHeaders?.();
        if (customHeaders && config.headers) {
          Object.entries(customHeaders).forEach(([key, value]) => {
            if (typeof config.headers.set === "function") {
              config.headers.set(key, value);
            } else {
              config.headers[key] = value;
            }
          });
        }
      }

      if (process.env.NODE_ENV === "development") {
        console.log(
          `[API Request] ${config.method?.toUpperCase()} ${config.url}`,
          config.params || config.data,
        );
      }

      return config;
    },
    (error) => Promise.reject(error),
  );

  // Response interceptor: unwrap data, handle 401 refresh, normalize errors
  client.interceptors.response.use(
    (response) => {
      const res = response?.data?.data ?? response?.data;

      if (process.env.NODE_ENV === "development") {
        console.log(
          `[API Success] ${response.config.method?.toUpperCase()} ${response.config.url}`,
          res,
        );
      }

      return res;
    },
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & {
        _retry?: boolean;
      };

      // Handle 401 with token refresh
      if (
        error.response?.status === 401 &&
        !originalRequest._retry &&
        tokenProvider?.refreshToken
      ) {
        if (isRefreshing) {
          return new Promise<string | null>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(
                new Error("Token refresh timeout - request took too long"),
              );
            }, REFRESH_TIMEOUT);

            failedQueue.push({
              resolve: (token) => {
                clearTimeout(timeoutId);
                resolve(token);
              },
              reject: (err) => {
                clearTimeout(timeoutId);
                reject(err);
              },
            });
          })
            .then((token) => {
              if (token && originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              return client(originalRequest);
            })
            .catch((err) => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const newToken = await tokenProvider.refreshToken();

          if (newToken && originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            processQueue(null, newToken);
            return client(originalRequest);
          }

          throw new Error("Refresh failed to return a valid token");
        } catch (refreshError) {
          processQueue(refreshError, null);

          // Dispatch logout event on refresh failure
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("auth:logout"));
          }
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      // Normalize error
      const responseData = error.response?.data as any;
      const apiError: ApiError = {
        message:
          responseData?.message ||
          error.message ||
          "An unexpected error occurred",
        code: responseData?.code,
        statusCode: error.response?.status,
        originalError: error,
      };

      if (originalRequest) {
        const endpoint = `${originalRequest.method?.toUpperCase()} ${originalRequest.url}`;
        console.error(`[API ERROR - ${endpoint}]`, {
          message: apiError.message,
          code: apiError.code,
          statusCode: apiError.statusCode,
        });
      }

      throw apiError;
    },
  );

  return client;
};
