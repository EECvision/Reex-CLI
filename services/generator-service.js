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
import axios from "axios";
import { TokenProvider } from "./core";
import { getSession } from "next-auth/react";

// Extend the Session type to include accessToken
declare module "next-auth" {
  interface Session {
    accessToken?: string;
  }
}

// Keys for LocalStorage
const REFRESH_TOKEN_KEY = "refresh_token";

// In-memory storage for access token
let accessToken: string | null = null;

// TokenProvider that stores tokens in memory and refreshes via API endpoint
export const cookieTokenProvider: TokenProvider = {
  getToken: () => accessToken,

  refreshToken: async () => {
    try {
      const response = await axios.get("/api/v1/auth/refresh");
      accessToken = response.data.accessToken;
      return accessToken;
    } catch {
      accessToken = null;
      return null;
    }
  },
};

// TokenProvider for NextAuth.js - retrieves token from session
export const nextAuthTokenProvider: TokenProvider = {
  getToken: async () => {
    const session = await getSession();
    return (session?.accessToken as string) || null;
  },
  refreshToken: undefined,
};

// Define the interface for our specific provider (adds set/clear methods)
interface LocalStorageTokenProvider extends TokenProvider {
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearTokens: () => void;
}

export const localStorageTokenProvider: LocalStorageTokenProvider = {
  // 1. Get the Access Token (used by API headers)
  getToken: () => accessToken,

  // 2. Login/Signup Component calls this on success
  setTokens: (newAccessToken: string, refreshToken: string) => {
    accessToken = newAccessToken;
    if (typeof window !== "undefined") {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
  },

  // 3. Logout Component calls this
  clearTokens: () => {
    accessToken = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  },

  // 4. The Core Logic: Exchange Refresh Token for new Access Token
  refreshToken: async () => {
    try {
      if (typeof window === "undefined") return null;

      // A. Retrieve the refresh token from storage
      const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!storedRefreshToken) throw new Error("No refresh token found");

      // B. Send it to the backend in the BODY (Pattern B)
      // NOTE: Use a raw axios instance to avoid circular dependencies
      const response = await axios.post("/api/v1/auth/refresh", {
        refresh_token: storedRefreshToken, // Match your API's expected field name
      });

      // C. Update our state with the NEW tokens
      const { accessToken: newAccess, refreshToken: newRefresh } =
        response.data;

      accessToken = newAccess;

      // Optional: If backend rotates refresh tokens, update it too
      if (newRefresh) {
        localStorage.setItem(REFRESH_TOKEN_KEY, newRefresh);
      }

      return accessToken;
    } catch {
      // If refresh fails (token expired/invalid), log them out completely
      console.warn("Refresh failed, logging out...");
      accessToken = null;
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      return null;
    }
  },
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
import { cookieTokenProvider } from "./token-providers";

// Choose the appropriate token provider for your authentication strategy:

// Option 1: Cookie-based auth (default)
// Server manages refresh tokens via httpOnly cookies
export const apiClient = createApiClient(cookieTokenProvider);

// Option 2: NextAuth.js
// Uncomment if using NextAuth.js for session management:
// import { nextAuthTokenProvider } from "./token-providers";
// export const apiClient = createApiClient(nextAuthTokenProvider);

// Option 3: LocalStorage-based auth
// Client-side token management with refresh token in localStorage:
// import { localStorageTokenProvider } from "./token-providers";
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

      // 9. AuthGuard Components
      const authGuardDir = path.join(apiTargetDir, 'src', 'api-services', 'AuthGuard');
      if (!fs.existsSync(authGuardDir)) {
        fs.mkdirSync(authGuardDir, { recursive: true });
      }

      // 9a. CookieTokenProvider.tsx
      const cookieProviderPath = path.join(authGuardDir, 'CookieTokenProvider.tsx');
      if (!fs.existsSync(cookieProviderPath)) {
        const content = `
"use client";

import { useEffect, useState } from "react";
import { cookieTokenProvider } from "../config/token-providers";

/**
 * Authentication initialization wrapper for cookie-based token provider
 *
 * Purpose:
 * Ensures access token is loaded into memory before rendering the app.
 * Since cookieTokenProvider stores access tokens in memory, they're lost
 * on page refresh. This component restores the token on app mount by
 * calling the refresh endpoint.
 *
 * How it works:
 * 1. Blocks rendering with loading state
 * 2. Calls refresh endpoint to get new access token from httpOnly cookie
 * 3. Stores token in memory via cookieTokenProvider
 * 4. Optionally sets custom headers if needed
 * 5. Renders children once token is restored (or refresh fails gracefully)
 *
 * Usage:
 * Wrap your root layout or app component:
 *
 * @example
 * // app/layout.tsx
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <CookieTokenProvider>
 *           {children}
 *         </CookieTokenProvider>
 *       </body>
 *     </html>
 *   );
 * }
 *
 * @example
 * // Setting custom headers after initialization
 * // In your login component or wherever you receive session data:
 * import { cookieTokenProvider } from '@/lib/api/token-providers';
 *
 * const handleLogin = async (credentials) => {
 *   const response = await loginApi(credentials);
 *
 *   // Set custom headers required by your backend
 *   cookieTokenProvider.setCustomHeaders({
 *     'x-session-key': response.sessionKey,
 *     'x-tenant-id': response.tenantId,
 *     'x-workspace-id': response.workspaceId
 *   });
 *
 *   router.push('/dashboard');
 * };
 *
 * Note: Only needed for cookieTokenProvider. Not required for:
 * - nextAuthTokenProvider (NextAuth handles initialization)
 * - localStorageTokenProvider (if you implement token restoration separately)
 */
export const CookieTokenProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    /**
     * Initialize authentication state on app mount
     * Attempts to restore access token from server-side refresh token cookie
     */
    const initAuth = async () => {
      try {
        // Call refresh endpoint to restore access token in memory
        await cookieTokenProvider.refreshToken?.();

        // OPTIONAL: Set custom headers if needed at initialization
        // Uncomment and modify based on your backend requirements:
        /*
        cookieTokenProvider.setCustomHeaders({
          'x-session-key': 'value-from-somewhere',
          'x-tenant-id': 'tenant-123'
        });
        */
      } catch (error) {
        // Gracefully handle initialization failure
        // User will be redirected to login on first authenticated API call
        console.warn("Auth initialization failed:", error);
      } finally {
        // Always set ready to prevent infinite loading state
        setIsReady(true);
      }
    };

    initAuth();
  }, []);

  // Show loading state while initializing authentication
  // Replace with your app's loading component or skeleton
  if (!isReady) {
    return <div>Loading...</div>;
  }

  return <>{children}</>;
};
`.trim();
        fs.writeFileSync(cookieProviderPath, content);
        console.log("[Generator] Scaffoled AuthGuard/CookieTokenProvider.tsx");
      }

      // 9b. LocalStorageTokenProvider.tsx
      const localStorageProviderPath = path.join(authGuardDir, 'LocalStorageTokenProvider.tsx');
      if (!fs.existsSync(localStorageProviderPath)) {
        const content = `
"use client";

import { useEffect, useState } from "react";
import { localStorageTokenProvider } from "../config/token-providers";

/**
 * Authentication initialization wrapper for localStorage-based token provider
 *
 * Purpose:
 * Restores user session on app mount by exchanging persisted refresh token
 * for a new access token. Essential for maintaining login state across
 * page refreshes when using localStorageTokenProvider.
 *
 * How it works:
 * 1. Checks if refresh token exists in localStorage
 * 2. If found, calls refresh endpoint to obtain new access token
 * 3. Stores access token in memory via localStorageTokenProvider
 * 4. Optionally sets custom headers if needed
 * 5. Renders children once initialization completes
 * 6. If no refresh token exists, skips refresh (user not logged in)
 *
 * Flow diagram:
 * Page Load → Check localStorage → Refresh Token Found?
 *   ├─ Yes → Call refreshToken() → Store in memory → Render app
 *   └─ No  → Skip refresh → Render app (unauthenticated)
 *
 * Usage:
 * Wrap your root layout or app component:
 *
 * @example
 * // app/layout.tsx
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <LocalStorageTokenProvider>
 *           {children}
 *         </LocalStorageTokenProvider>
 *       </body>
 *     </html>
 *   );
 * }
 *
 * @example
 * // Setting custom headers after login
 * // In your login component:
 * import { localStorageTokenProvider } from '@/lib/api/token-providers';
 *
 * const handleLogin = async (credentials) => {
 *   const response = await loginApi(credentials);
 *
 *   // Store tokens
 *   localStorageTokenProvider.setTokens(
 *     response.accessToken,
 *     response.refreshToken
 *   );
 *
 *   // Set custom headers required by your backend
 *   localStorageTokenProvider.setCustomHeaders({
 *     'x-session-key': response.sessionKey,
 *     'x-tenant-id': response.tenantId,
 *     'x-workspace-id': response.workspaceId
 *   });
 *
 *   router.push('/dashboard');
 * };
 *
 * Security considerations:
 * - Refresh token exposed in localStorage (vulnerable to XSS)
 * - Only use with proper CSP headers and XSS protection
 * - Consider cookieTokenProvider for production if backend supports httpOnly cookies
 *
 * Note: The refresh token key must match REFRESH_TOKEN_KEY in token-providers.ts
 * Update "refresh_token" below if you changed the constant
 */
export const LocalStorageTokenProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    /**
     * Initialize authentication state on app mount
     * Restores session by exchanging refresh token for access token
     */
    const initAuth = async () => {
      // Check if user has an existing session (refresh token in storage)
      // Update this key to match REFRESH_TOKEN_KEY in token-providers.ts
      const hasRefreshToken = !!localStorage.getItem("refresh_token");

      if (hasRefreshToken && localStorageTokenProvider?.refreshToken) {
        try {
          // Exchange refresh token for new access token
          // This populates the in-memory accessToken variable
          await localStorageTokenProvider.refreshToken();

          // OPTIONAL: Set custom headers if needed at initialization
          // Uncomment and modify based on your backend requirements:
          /*
          localStorageTokenProvider.setCustomHeaders({
            'x-session-key': 'value-from-somewhere',
            'x-tenant-id': 'tenant-123'
          });
          */
        } catch (error) {
          // Refresh failed - token likely expired or invalid
          // clearTokens() already called by refreshToken() on failure
          console.warn("Session restoration failed:", error);
        }
      }

      // Mark initialization complete regardless of outcome
      // Prevents infinite loading if refresh fails
      setIsReady(true);
    };

    initAuth();
  }, []);

  // Show loading state while restoring session
  // Replace with your app's loading component or skeleton
  if (!isReady) return <div>Loading...</div>;

  return <>{children}</>;
};
`.trim();
        fs.writeFileSync(localStorageProviderPath, content);
        console.log("[Generator] Scaffoled AuthGuard/LocalStorageTokenProvider.tsx");
      }

      // 9c. NextAuthProvider.tsx
      const nextAuthProviderPath = path.join(authGuardDir, 'NextAuthProvider.tsx');
      if (!fs.existsSync(nextAuthProviderPath)) {
        const content = `
"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { nextAuthTokenProvider } from "../config/token-providers";

/**
 * Authentication guard wrapper for NextAuth.js
 *
 * Purpose:
 * Protects routes by redirecting unauthenticated users to login page.
 * Wraps components that require authentication when using nextAuthTokenProvider.
 *
 * How it works:
 * 1. Monitors NextAuth session status (loading/authenticated/unauthenticated)
 * 2. Shows loading state while session is being validated
 * 3. Redirects to login if user is unauthenticated
 * 4. Optionally sets custom headers from session data
 * 5. Renders children only when user is authenticated
 *
 * Session states:
 * - "loading": Initial session check in progress
 * - "authenticated": Valid session exists, user is logged in
 * - "unauthenticated": No valid session, redirect to login
 *
 * Usage:
 * Wrap protected pages or layouts:
 *
 * @example
 * // app/dashboard/layout.tsx
 * export default function DashboardLayout({ children }) {
 *   return (
 *     <NextAuthProvider>
 *       {children}
 *     </NextAuthProvider>
 *   );
 * }
 *
 * @example
 * // app/profile/page.tsx
 * export default function ProfilePage() {
 *   return (
 *     <NextAuthProvider>
 *       <UserProfile />
 *     </NextAuthProvider>
 *   );
 * }
 *
 * @example
 * // Setting custom headers from NextAuth session
 * // First, extend your NextAuth session type to include custom fields:
 * // lib/auth.ts or next-auth.d.ts
 * declare module "next-auth" {
 *   interface Session {
 *     accessToken?: string;
 *     sessionKey?: string;
 *     tenantId?: string;
 *   }
 * }
 *
 * // Then this component will automatically set headers when session is available
 * // Or you can manually set headers in your signin callback:
 * // [...nextauth]/route.ts
 * callbacks: {
 *   async signIn({ user, account }) {
 *     // After successful sign in
 *     nextAuthTokenProvider.setCustomHeaders({
 *       'x-session-key': user.sessionKey,
 *       'x-tenant-id': user.tenantId
 *     });
 *     return true;
 *   }
 * }
 *
 * Configuration:
 * - Update "/auth/login" to match your login route
 * - Customize loading UI to match your app's design
 *
 * Note: This component handles route protection only.
 * Token management is handled automatically by nextAuthTokenProvider
 * through NextAuth's jwt() and session() callbacks.
 */
export const NextAuthProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { data: session, status } = useSession();
  const router = useRouter();

  /**
   * Redirect unauthenticated users to login page
   * Runs whenever session status changes
   */
  useEffect(() => {
    if (status === "unauthenticated") {
      // Update this path to match your login route
      router.push("/auth/login");
    }
  }, [status, router]);

  /**
   * Set custom headers from session data when authenticated
   */
  useEffect(() => {
    if (status === "authenticated" && session) {
      // OPTIONAL: Set custom headers from session
      // Uncomment and modify based on your session structure:
      /*
      nextAuthTokenProvider.setCustomHeaders({
        'x-session-key': session.sessionKey,
        'x-tenant-id': session.tenantId,
        'x-workspace-id': session.workspaceId
      });
      */
    }
  }, [status, session]);

  // Show loading state during initial session validation
  // Replace with your app's loading component or skeleton
  if (status === "loading") {
    return <div>Loading...</div>;
  }

  // Render protected content only when authenticated
  if (status === "authenticated") {
    return <>{children}</>;
  }

  // Return null during redirect to prevent flash of protected content
  return null;
};
`.trim();
        fs.writeFileSync(nextAuthProviderPath, content);
        console.log("[Generator] Scaffoled AuthGuard/NextAuthProvider.tsx");
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
