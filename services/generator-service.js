const fs = require('fs');
const path = require('path');
const projectService = require('./project-service');
const typeService = require('./type-service');
const hookService = require('./hook-service');
const configService = require('./config-service');
const sseService = require('./sse-service');

class GeneratorService {

  /**
   * Regenerates the API project structure:
   * 1. Scaffolds config files (constants, core, utils)
   * 2. Generates Manifest from definitions
   * 3. Generates Hooks
   * 4. Generates Types
   * 5. Prunes unused clients
   * 6. Generates index barrel
   * 7. Generates QueryProvider
   * @param {string} apiTargetDir 
   */
  regenerate(apiTargetDir) {
    const definitionsDir = path.join(apiTargetDir, 'src', 'api-services', 'definitions');
    const configDir = path.join(apiTargetDir, 'src', 'api-services', 'config');
    const indexTimePath = path.join(configDir, 'index.ts');
    const constantsPath = path.join(configDir, 'constants.ts');
    const corePath = path.join(configDir, 'core.ts');
    const clientsPath = path.join(configDir, 'clients.ts');
    const providersDir = path.join(apiTargetDir, 'src', 'api-services', 'providers');
    const queryProviderPath = path.join(providersDir, 'QueryProvider.tsx');

    try {
      console.log("[Generator] Regenerating Manifest & Hooks...");

      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // 1. constants.ts - Managed by Bridge (Base URL)
      if (!fs.existsSync(constantsPath)) {
        const constantsContent = `
export const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.example.com";
`;
        fs.writeFileSync(constantsPath, constantsContent);
        console.log("[Generator] Scaffoled config/constants.ts");
      }

      // 1b. token-providers.ts - Auth Strategies
      const tokenProvidersPath = path.join(configDir, 'token-providers.ts');
      if (!fs.existsSync(tokenProvidersPath)) {
        const tokenProvidersContent = `
import { TokenProvider } from "./core";
import { getCookie } from "cookies-next";

/**
 * Cookie-based token provider
 * Assumes the access token is stored in a cookie named 'access_token'
 */
export const cookieTokenProvider: TokenProvider = {
  getToken: () => {
    // Check if running in browser
    if (typeof window !== "undefined") {
      return getCookie("access_token") as string | null;
    }
    // Server-side logic would go here (e.g. reading from request headers)
    return null;
  }
};
`;
        fs.writeFileSync(tokenProvidersPath, tokenProvidersContent);
        console.log("[Generator] Scaffoled config/token-providers.ts");
      }

      // 2. core.ts - User Managed (Interceptors), imports constants
      if (!fs.existsSync(corePath)) {
        const coreContent = `
// lib/api/core.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, {
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosError,
  AxiosRequestConfig,
} from "axios";
import { baseURL } from "./constants";

/**
 * Token provider interface - allows swapping auth strategies without changing core logic
 */
export interface TokenProvider {
  /**
   * Retrieve the current access token
   * @returns Access token string or null if not available
   */
  getToken: () => Promise<string | null> | string | null;

  /**
   * Refresh the access token when it expires
   * @returns New access token or null if refresh failed
   */
  refreshToken?: () => Promise<string | null>;
}

/**
 * Standardized API error shape
 */
export interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
  originalError?: unknown;
}

const DEFAULT_CONFIG: AxiosRequestConfig = {
  baseURL: baseURL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
};

/**
 * Timeout for queued requests waiting for token refresh (in milliseconds)
 * If refresh takes longer than this, queued requests will be rejected
 */
const REFRESH_TIMEOUT = 10000; // 10 seconds

/**
 * Creates a configured Axios client with authentication and error handling
 *
 * Features:
 * - Automatic token injection via TokenProvider
 * - Auto-retry on 401 with token refresh
 * - Concurrent request handling (prevents multiple simultaneous refresh calls)
 * - Queue timeout protection (prevents infinite waiting)
 * - Standardized error normalization
 * - Response data auto-unwrapping
 * - Request/response logging in development
 *
 * Concurrent Request Flow:
 * 1. First 401 → Starts token refresh, sets isRefreshing = true
 * 2. Subsequent 401s → Queued while refresh is in progress
 * 3. Refresh completes → All queued requests retry with new token
 * 4. Refresh fails → All queued requests are rejected
 *
 * @param tokenProvider - Optional auth token provider
 * @returns Configured Axios instance
 */
export const createApiClient = (
  tokenProvider?: TokenProvider,
): AxiosInstance => {
  const client = axios.create(DEFAULT_CONFIG);

  // ==================== CONCURRENT REFRESH HANDLING STATE ====================
  /**
   * Flag to track if a token refresh is currently in progress
   * Prevents multiple simultaneous refresh requests
   */
  let isRefreshing = false;

  /**
   * Queue of failed requests waiting for token refresh to complete
   * Each request can be resolved with new token or rejected on refresh failure
   */
  let failedQueue: Array<{
    resolve: (token: string | null) => void;
    reject: (error: any) => void;
  }> = [];

  /**
   * Process all queued requests after token refresh completes
   * @param error - Error if refresh failed, null if successful
   * @param token - New token if refresh succeeded, null if failed
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
      // Inject authentication token if provider exists
      if (tokenProvider) {
        const token = await tokenProvider.getToken();
        if (token && config.headers) {
          config.headers.Authorization = \`Bearer \${token}\`;
        }
      }

      // Log requests in development mode
      if (process.env.NODE_ENV === "development") {
        console.log(
          \`[API Request] \${config.method?.toUpperCase()} \${config.url}\`,
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
      // Log successful responses in development
      if (process.env.NODE_ENV === "development") {
        console.log(
          \`[API Success] \${response.config.method?.toUpperCase()} \${response.config.url}\`,
          response.data,
        );
      }

      // Auto-unwrap response.data to simplify API calls
      return response.data;
    },
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & {
        _retry?: boolean;
      };

      // ==================== HANDLE 401 UNAUTHORIZED ====================
      if (
        error.response?.status === 401 &&
        !originalRequest._retry &&
        tokenProvider?.refreshToken
      ) {
        // ========== CASE A: REFRESH ALREADY IN PROGRESS ==========
        // Queue this request and wait for the ongoing refresh to complete
        if (isRefreshing) {
          return new Promise<string | null>((resolve, reject) => {
            // Add timeout to prevent infinite waiting
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
              // Retry request with new token
              if (token && originalRequest.headers) {
                originalRequest.headers.Authorization = \`Bearer \${token}\`;
              }
              return client(originalRequest);
            })
            .catch((err) => Promise.reject(err));
        }

        // ========== CASE B: FIRST 401 - START REFRESH ==========
        originalRequest._retry = true;
        isRefreshing = true;

        try {
          // Attempt to refresh the token
          const newToken = await tokenProvider.refreshToken();

          if (newToken && originalRequest.headers) {
            originalRequest.headers.Authorization = \`Bearer \${newToken}\`;

            // Flush the queue with the new token
            processQueue(null, newToken);

            // Retry the original request
            return client(originalRequest);
          }

          // If no token returned, treat as failure
          throw new Error("Refresh failed to return a valid token");
        } catch (refreshError) {
          // Flush queue with error
          processQueue(refreshError, null);

          // Force logout on fatal refresh error
          if (typeof window !== "undefined") {
            // Dispatch global event so React/Next.js can handle redirect smoothly
            window.dispatchEvent(new Event("auth:logout"));
          }
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      // ==================== NORMALIZE ERROR SHAPE ====================
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

      // Log error with context
      if (originalRequest) {
        const endpoint = \`\${originalRequest.method?.toUpperCase()} \${originalRequest.url}\`;
        console.error(\`[API ERROR - \${endpoint}]\`, {
          message: apiError.message,
          code: apiError.code,
          statusCode: apiError.statusCode,
        });
      }

      // Throw normalized error (React Query will catch this)
      throw apiError;
    },
  );

  return client;
};
`;
        fs.writeFileSync(corePath, coreContent);
        console.log("[Generator] Scaffoled config/core.ts");
      }

      // clients.ts - SCAFFOLD ONLY (Generator manages this)
      if (!fs.existsSync(clientsPath)) {
        const clientsContent = `
import { createApiClient } from "./core";
import { cookieTokenProvider } from "./token-providers";

export const apiClient = createApiClient(cookieTokenProvider);
`;
        fs.writeFileSync(clientsPath, clientsContent);
        console.log("[Generator] Scaffoled config/clients.ts");
      }


      // index.ts - BARREL ONLY (Managed by Bridge)
      const indexContent = `
export * from "./core";
export * from "./clients";
`;
      fs.writeFileSync(indexTimePath, indexContent);
      console.log("[Generator] Updated config/index.ts");




      // 2. Generate Manifest
      // Prune definition files first (remove unused interfaces/imports)
      projectService.pruneUnusedDefinitions(definitionsDir);

      const manifest = projectService.generateManifest(definitionsDir);

      // 3. Generate Hooks
      hookService.generateHooks(apiTargetDir, manifest);

      // 3b. Generate Types Folder
      typeService.generateTypes(apiTargetDir, manifest);

      // 3c. Sync Clients (Auto-Prune unused clients)
      configService.updateClientsFile(apiTargetDir, {}, { prune: true });

      // 4. Regenerate Barrel File (src/api-services/index.ts)
      const moduleNames = Object.keys(manifest).sort();
      const barrelContent = `export * from "./config";
export * from "./config";


${moduleNames.map((name) => `import { ${name}Api } from "./definitions/${name}";`).join('\n')}

export const api = {
${moduleNames.map((name) => `  ...${name}Api,`).join('\n')}
};
`;
      const barrelPath = path.join(apiTargetDir, 'src', 'api-services', 'index.ts');
      fs.writeFileSync(barrelPath, barrelContent);
      console.log("[Generator] Regenerated src/api-services/index.ts");

      // 7. Providers (QueryProvider)
      if (!fs.existsSync(providersDir)) {
        fs.mkdirSync(providersDir, { recursive: true });
      }

      if (!fs.existsSync(queryProviderPath)) {
        const queryProviderContent = `
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";

export const queryClient = new QueryClient();

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
`;
        fs.writeFileSync(queryProviderPath, queryProviderContent.trim());
        console.log("[Generator] Scaffoled providers/QueryProvider.tsx");
      }

      // 8. Install Dependencies (axios, @tanstack/react-query)
      const packageJsonPath = path.join(apiTargetDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const dependencies = packageJson.dependencies || {};
        const devDependencies = packageJson.devDependencies || {};
        const allDeps = { ...dependencies, ...devDependencies };

        const packagesToInstall = [];
        if (!allDeps['axios']) packagesToInstall.push('axios');
        if (!allDeps['@tanstack/react-query']) packagesToInstall.push('@tanstack/react-query');
        if (!allDeps['cookies-next']) packagesToInstall.push('cookies-next');
        if (!allDeps['next-auth']) packagesToInstall.push('next-auth');

        if (packagesToInstall.length > 0) {
          console.log(`[Generator] Missing dependencies: ${packagesToInstall.join(', ')}. Installing...`);
          try {
            require('child_process').execSync(`npm install ${packagesToInstall.join(' ')}`, { cwd: apiTargetDir, stdio: 'inherit' });
            console.log("[Generator] Dependencies installed successfully.");
          } catch (err) {
            console.error("[Generator] Failed to install dependencies:", err);
          }
        }
      }

      sseService.broadcast(Date.now().toString(), 'project:updated', 'Project generated');
      console.log("[Generator] Regeneration Complete");
      return { success: true, manifestKeys: moduleNames };
    } catch (e) {
      console.error("[Generator] Regeneration Failed:", e);
      throw e;
    }
  }
}

module.exports = new GeneratorService();
