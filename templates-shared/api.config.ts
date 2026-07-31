// @user-config — Update routes, keys, and endpoints to match your backend.

import axios from "axios";
import { type ReexConfig } from "./core";

// Replace this with your API base URL or an environment variable
// (e.g. process.env.NEXT_PUBLIC_API_URL).
const BASE_URL = "https://example.com/api/v1";

export const apiConfig = {
  baseURL: BASE_URL,

  // Set to `true` if your API wraps every response in a top-level `data` property.
  // When enabled, also turn on "Unwrap Response Data" in the Reex UI before
  // saving or copying generated response interfaces.
  unwrapResponseData: false,

  // Enable request/response logging.
  // For development only, consider:
  // process.env.NODE_ENV === "development"
  // or
  // import.meta.env.DEV
  enableApiLogging: true,

  auth: {
    // Refresh token endpoint. Update this to match your backend.
    refreshEndpoint: `${BASE_URL}/auth/refresh`,

    // The localStorage keys used to persist authentication tokens.
    // Change these if you prefer different storage key names.
    //
    // Note: The access token is stored in memory by default.
    // It is only persisted to localStorage if your backend does not
    // return a refresh token.
    accessTokenKey: "access_token",
    refreshTokenKey: "refresh_token",

    // Extract authentication tokens from your backend response.
    //
    // Note: `responseBody` is affected by the `unwrapResponseData` setting.
    // If `unwrapResponseData` is enabled, `responseBody` contains only the
    // unwrapped `data` object. Otherwise, it contains the full response body.
    //
    // Update these paths to match your API response structure.
    extractTokens: (responseBody: Record<string, unknown>) => ({
      accessToken: responseBody?.accessToken as string | undefined,
      refreshToken: responseBody?.refreshToken as string | undefined,
    }),

    // Choose the refresh strategy that matches your authentication flow.

    // Cookie-based authentication.
    // Use this when the `ReexProvider` auth strategy is set to `"cookie"`.
    // Your backend stores authentication tokens in HttpOnly cookies.
    refreshWithCookie: async () =>
      axios.post(apiConfig.auth.refreshEndpoint, undefined, {
        withCredentials: true,
      }),

    // Token-based authentication.
    // Use this when the `ReexProvider` auth strategy is set to `"localStorage"`.
    // Rename `refreshToken` in the request body if your backend expects
    // a different field name (e.g. `refresh_token`).
    refreshWithToken: async (storedRefreshToken: string) =>
      axios.post(apiConfig.auth.refreshEndpoint, {
        refreshToken: storedRefreshToken,
      }),
  },
} satisfies ReexConfig;
