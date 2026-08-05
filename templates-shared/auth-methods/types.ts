/** Standardized API error response */
export interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
  originalError?: unknown;
}

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

  /** Remove a specific custom header */
  removeCustomHeader?: (key: string) => void;

  /** Set new auth tokens (called on login/signup for token-based auth) */
  setTokens?: (tokens: { accessToken: string; refreshToken?: string }) => void;

  /** Activate or set session on login (handles tokens, cookie-based sessions, and optional headers) */
  setSession?: (
    tokens?: { accessToken?: string; refreshToken?: string },
    headers?: Record<string, string>,
  ) => void;

  /** Clear all auth tokens (called on logout) */
  clearTokens?: () => void;
}
