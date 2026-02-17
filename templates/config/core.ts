// lib/api/core.ts
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

/**
 * Token provider interface for pluggable authentication strategies
 */
export interface TokenProvider {
    /**
     * Get current access token
     */
    getToken: () => Promise<string | null> | string | null;

    /**
     * Refresh expired token
     */
    refreshToken?: () => Promise<string | null>;

    /**
     * Get custom headers to be injected into all API requests
     * Returns key-value pairs of header names and values
     * * @returns Record of header names to values, or empty object if none
     * * @example
     * getCustomHeaders: () => ({
     * 'x-session-key': 'abc123',
     * 'x-workspace-id': 'workspace-789'
     * })
     */
    getCustomHeaders?: () =>
        | Promise<Record<string, string>>
        | Record<string, string>;

    /**
     * Set custom headers to be injected into all API requests
     * Completely replaces any previously set custom headers
     * * @param headers - Record of header names to values
     * * @example
     * setCustomHeaders({
     * 'x-session-key': 'abc123',
     * 'x-workspace-id': 'workspace-789'
     * })
     */
    setCustomHeaders?: (headers: Record<string, string>) => void;
}

/**
 * Standardized API error response
 */
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

/**
 * Creates an Axios client with automatic token handling and refresh on 401
 *
 * Features:
 * - Auto token injection from TokenProvider
 * - Auto-retry failed requests after token refresh
 * - Queues concurrent 401s to prevent multiple refresh calls
 * - Timeout protection for queued requests
 * - Normalized error handling
 * - Auto-unwraps response.data
 *
 * @param tokenProvider - Authentication token provider (optional)
 * @returns Configured Axios instance
 */
export const createApiClient = (
    tokenProvider?: TokenProvider,
): AxiosInstance => {
    const client = axios.create(DEFAULT_CONFIG);

    // ==================== TOKEN REFRESH STATE ====================
    let isRefreshing = false;
    let failedQueue: Array<{
        resolve: (token: string | null) => void;
        reject: (error: any) => void;
    }> = [];

    /**
     * Resolves or rejects all queued requests after token refresh completes
     */
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

    // ==================== REQUEST INTERCEPTOR ====================
    client.interceptors.request.use(
        async (config: InternalAxiosRequestConfig) => {
            if (tokenProvider) {
                // Inject Bearer token if available
                const token = await tokenProvider.getToken();
                if (token && config.headers) {
                    config.headers.Authorization = `Bearer ${token}`;
                }

                // Inject custom headers if available
                const customHeaders = await tokenProvider.getCustomHeaders?.();
                if (customHeaders && config.headers) {
                    Object.entries(customHeaders).forEach(([key, value]) => {
                        config.headers[key] = value;
                    });
                }
            }

            // Development logging
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

    // ==================== RESPONSE INTERCEPTOR ====================
    client.interceptors.response.use(
        (response) => {
            // Unwrap response.data for cleaner API calls
            const res = response?.data?.data ?? response?.data;

            // Development logging
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

            // ==================== HANDLE 401 WITH TOKEN REFRESH ====================
            if (
                error.response?.status === 401 &&
                !originalRequest._retry &&
                tokenProvider?.refreshToken
            ) {
                // Queue request if refresh already in progress
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
                            // Retry with new token
                            if (token && originalRequest.headers) {
                                originalRequest.headers.Authorization = `Bearer ${token}`;
                            }
                            return client(originalRequest);
                        })
                        .catch((err) => Promise.reject(err));
                }

                // Start token refresh
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

            // ==================== NORMALIZE ERROR ====================
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

            // Log error in development
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
