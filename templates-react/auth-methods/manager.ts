// @internal — No changes needed

import { type TokenProvider } from "./types";
import { cookieTokenProvider } from "./cookie-auth/provider";
import { localStorageTokenProvider } from "./localstorage-auth/provider";

export type AuthStrategy = "cookie" | "localstorage";

let activeTokenProvider: TokenProvider = localStorageTokenProvider;

/**
 * Updates the globally active token provider based on the chosen strategy.
 * Used internally by the <AuthProvider> component.
 */
export const setActiveStrategy = (strategy: AuthStrategy) => {
  switch (strategy) {
    case "cookie":
      activeTokenProvider = cookieTokenProvider;
      break;
      break;
    case "localstorage":
      activeTokenProvider = localStorageTokenProvider;
      break;
  }
};

/**
 * Proxy provider that dynamically resolves to the currently active token provider.
 * This ensures the API client always uses the correctly configured strategy without
 * needing to recreate the Axios instance.
 */
export const proxyTokenProvider: TokenProvider = {
  getToken: () => activeTokenProvider.getToken(),
  get refreshToken() {
    return activeTokenProvider.refreshToken;
  },
  get getCustomHeaders() {
    return activeTokenProvider.getCustomHeaders;
  },
  get setCustomHeaders() {
    return activeTokenProvider.setCustomHeaders;
  },
  get removeCustomHeader() {
    return activeTokenProvider.removeCustomHeader;
  },
};

/**
 * Use this function to access the active token provider from an external file.
 * This is the recommended way to get or set auth tokens after login.
 */
export function getActiveProvider(): {
  getToken?: () => Promise<string | null> | string | null;
  setTokens?: (p: { accessToken: string; refreshToken?: string }) => void;
  clearTokens?: () => void;
  setCustomHeaders?: (headers: Record<string, string>) => void;
  getCustomHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
  removeCustomHeader?: (key: string) => void;
} | null {
  return activeTokenProvider ?? null;
}
