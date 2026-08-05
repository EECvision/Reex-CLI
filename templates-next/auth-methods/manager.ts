import { cookieTokenProvider } from "./cookie-auth/provider";
import { jwtTokenProvider } from "./jwt-auth/provider";
import { nextAuthTokenProvider } from "./next-auth/provider";
import { type TokenProvider } from "./types";

export type AuthStrategy = "jwt" | "cookie" | "next-auth";

let activeTokenProvider: TokenProvider = jwtTokenProvider;

/**
 * Updates the globally active token provider based on the chosen strategy.
 * Used internally by the <AuthProvider> component.
 */
export const setActiveStrategy = (strategy: AuthStrategy) => {
  switch (strategy) {
    case "cookie":
      activeTokenProvider = cookieTokenProvider;
      break;
    case "next-auth":
      activeTokenProvider = nextAuthTokenProvider;
      break;
    case "jwt":
      activeTokenProvider = jwtTokenProvider;
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
  get setTokens() {
    return activeTokenProvider.setTokens;
  },
  get setSession() {
    return activeTokenProvider.setSession;
  },
  get clearTokens() {
    return activeTokenProvider.clearTokens;
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
export function getActiveProvider(): TokenProvider | null {
  return activeTokenProvider ?? null;
}
