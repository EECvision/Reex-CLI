// @internal — No changes needed
/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

import type { ApiError, TokenProvider } from "./auth-methods/types";
import { apiConfig } from "./api.config";
import { proxyTokenProvider } from "./auth-methods/manager";

const API_TIMEOUT = 30000;
const REFRESH_TIMEOUT = 10000;

// Helper to extract a human-readable string from various error response formats
const formatErrorMessage = (data: any): string | undefined => {
  if (!data) return undefined;

  if (typeof data.error === "string") return data.error;
  if (typeof data.message === "string") return data.message;
  if (typeof data.msg === "string") return data.msg;

  if (data.detail !== undefined && data.detail !== null) {
    if (typeof data.detail === "string") return data.detail;

    if (Array.isArray(data.detail)) {
      return data.detail
        .map((err: any) => {
          const field =
            Array.isArray(err.loc) && err.loc.length
              ? err.loc[err.loc.length - 1]
              : undefined;

          const msg = err.msg || "Invalid value";
          return field ? `${field}: ${msg}` : msg;
        })
        .join("; ");
    }

    if (typeof data.detail === "object") {
      return data.detail.message || data.detail.msg || "Invalid request";
    }
  }

  return undefined;
};

const DEFAULT_CONFIG: AxiosRequestConfig = {
  baseURL: apiConfig.baseURL,
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
      if (config.data instanceof FormData && config.headers) {
        delete config.headers["Content-Type"];
      }

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
      const rawData = response?.data;
      const res = apiConfig.unwrapResponseData
        ? (rawData?.data ?? rawData)
        : rawData;

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

            // Notify useNotification consumers about the auth failure
            window.dispatchEvent(
              new CustomEvent("api:notification", {
                detail: {
                  id: crypto.randomUUID(),
                  type: "error",
                  message:
                    formatErrorMessage(error.response?.data) ||
                    "Authentication failed. Please log in again.",
                  statusCode: 401,
                  timestamp: new Date().toISOString(),
                },
              }),
            );
          }

          // Return early — notification already dispatched above; don't fall through
          // to the generic error dispatch below.
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      } else if (error.response?.status === 401) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("auth:logout"));

          // Notify useNotification consumers about the auth failure
          window.dispatchEvent(
            new CustomEvent("api:notification", {
              detail: {
                id: crypto.randomUUID(),
                type: "error",
                message:
                  formatErrorMessage(error.response?.data) ||
                  "Authentication failed. Please log in again.",
                statusCode: 401,
                timestamp: new Date().toISOString(),
              },
            }),
          );
        }

        // Return early — notification already dispatched above; don't fall through
        // to the generic error dispatch below.
        throw error;
      }

      // Normalize error
      const responseData = error.response?.data as any;
      const apiError: ApiError = {
        message:
          formatErrorMessage(responseData) ||
          error.message ||
          "An unexpected error occurred",
        code: responseData?.error || responseData?.code,
        statusCode: error.response?.status,
        originalError: error,
      };

      if (originalRequest) {
        const endpoint = `${originalRequest.method?.toUpperCase()} ${originalRequest.url}`;
        console.log(`[API ERROR - ${endpoint}]`, {
          message: apiError.message,
          code: apiError.code,
          statusCode: apiError.statusCode,
        });
      }

      // Dispatch notification event for useNotification consumers
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("api:notification", {
            detail: {
              id: crypto.randomUUID(),
              type: "error",
              message: apiError.message,
              statusCode: apiError.statusCode,
              timestamp: new Date().toISOString(),
            },
          }),
        );
      }

      throw apiError;
    },
  );

  return client;
};

/**
 * The globally configured API client instance.
 * It dynamically uses the Active Strategy defined in the AuthProvider.
 */
export const apiClient = createApiClient(proxyTokenProvider);
