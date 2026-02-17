const fs = require('fs');
const path = require('path');
const projectService = require('./project-service');
const typeService = require('./type-service');
const hookService = require('./hook-service');
const configService = require('./config-service');
const sseService = require('./sse-service');

class GeneratorService {

  copyRecursiveSync(src, dest) {
    if (fs.existsSync(src)) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      fs.readdirSync(src).forEach((childItemName) => {
        const srcPath = path.join(src, childItemName);
        const destPath = path.join(dest, childItemName);
        const stats = fs.statSync(srcPath);
        if (stats.isDirectory()) {
          this.copyRecursiveSync(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      });
    }
  }

  /**
   * Regenerates the API project structure:
   * 1. Scaffolds config files (constants, core, utils)
   * 2. Generates Manifest from definitions
   * 3. Generates Hooks
   * 4. Generates Types
   * 5. Prunes unused clients
   * 6. Generates index barrel
   * 7. Copies Providers (from templates)
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

      // 1b. token-providers.ts - REMOVED (Replaced by Providers folder)
      // Check if legacy file exists and remove it
      const tokenProvidersPath = path.join(configDir, 'token-providers.ts');
      if (fs.existsSync(tokenProvidersPath)) {
        try {
          fs.unlinkSync(tokenProvidersPath);
          console.log("[Generator] Removed legacy config/token-providers.ts");
        } catch (e) {
          console.warn("[Generator] Failed to remove legacy config/token-providers.ts", e);
        }
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
  getCustomHeaders?: () => Promise<Record<string, string>> | Record<string, string>;

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
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
};

/**
 * Max wait time for queued requests during token refresh (10 seconds)
 */
const REFRESH_TIMEOUT = 10000;

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
          config.headers.Authorization = \`Bearer \${token}\`;
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
      // Development logging
      if (process.env.NODE_ENV === "development") {
        console.log(
          \`[API Success] \${response.config.method?.toUpperCase()} \${response.config.url}\`,
          response.data,
        );
      }

      // Unwrap response.data for cleaner API calls
      return response.data;
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
                originalRequest.headers.Authorization = \`Bearer \${token}\`;
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
            originalRequest.headers.Authorization = \`Bearer \${newToken}\`;
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
        const endpoint = \`\${originalRequest.method?.toUpperCase()} \${originalRequest.url}\`;
        console.error(\`[API ERROR - \${endpoint}]\`, {
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
`;
        fs.writeFileSync(corePath, coreContent);
        console.log("[Generator] Scaffoled config/core.ts");
      }

      // clients.ts - SCAFFOLD ONLY (Generator manages this)
      if (!fs.existsSync(clientsPath)) {
        const clientsContent = `
import { createApiClient } from "./core";
import { cookieTokenProvider } from "../providers/Cookie/CookieToken";

// Choose the appropriate token provider for your authentication strategy:

// Option 1: Cookie-based auth (default)
// Server manages refresh tokens via httpOnly cookies
export const apiClient = createApiClient(cookieTokenProvider);

// Option 2: NextAuth.js
// Uncomment if using NextAuth.js for session management:
// import { nextAuthTokenProvider } from "../providers/NextAuth/NextToken";
// export const apiClient = createApiClient(nextAuthTokenProvider);

// Option 3: LocalStorage-based auth
// Client-side token management with refresh token in localStorage:
// import { localStorageTokenProvider } from "../providers/LocalStorage/LocalStorageToken";
// export const apiClient = createApiClient(localStorageTokenProvider);
// Note: Call localStorageTokenProvider.setTokens() after login
// Call localStorageTokenProvider.clearTokens() on logout
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

      // 7. Providers (Copy from templates)
      if (!fs.existsSync(providersDir)) {
        fs.mkdirSync(providersDir, { recursive: true });
      }

      const templateProvidersDir = path.join(__dirname, '../templates/providers');
      if (fs.existsSync(templateProvidersDir)) {
        this.copyRecursiveSync(templateProvidersDir, providersDir);
        console.log("[Generator] Copied providers from templates");
      } else {
        console.warn("[Generator] Warning: templates/providers directory not found");
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

      // 9. AuthGuard Components - REMOVED
      // Cleanup legacy AuthGuard directory if it exists
      const authGuardDir = path.join(apiTargetDir, 'src', 'api-services', 'AuthGuard');
      if (fs.existsSync(authGuardDir)) {
        try {
          fs.rmSync(authGuardDir, { recursive: true, force: true });
          console.log("[Generator] Removed legacy AuthGuard directory");
        } catch (e) {
          console.warn("[Generator] Failed to remove legacy AuthGuard directory", e);
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
