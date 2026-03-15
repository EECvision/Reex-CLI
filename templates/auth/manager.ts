import { type TokenProvider } from "./types";
import { cookieTokenProvider } from "./cookie-auth/provider";
import { nextAuthTokenProvider } from "./next-auth/provider";
import { localStorageTokenProvider } from "./localstorage-auth/provider";

export type AuthStrategy = "cookie" | "next-auth" | "localstorage";

export let activeTokenProvider = localStorageTokenProvider;

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
};
