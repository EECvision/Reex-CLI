// @user-config — Update routes, keys, and endpoints to match your backend.

import axios from "axios";
import { type ReexConfig } from "./.reex/config";

// Replace this with your API base URL or an environment variable
// (e.g. process.env.NEXT_PUBLIC_API_URL).
const BASE_URL = "https://example.com/api/v1";

export const apiConfig: ReexConfig = {
  baseURL: BASE_URL,

  // Set to `true` if your API wraps every response in a top-level `data` property.
  // When enabled, also turn on "Unwrap Response Data" in the Reex UI before
  // saving or copying generated response interfaces.
  unwrapResponseData: false,

  // Enable request/response logging.
  // For development only, consider:
  //   process.env.NODE_ENV === "development"
  // or
  //   import.meta.env.DEV
  enableApiLogging: false,

  auth: {
    // ---------------------------------------------------------------------------
    // General authentication configuration
    // ---------------------------------------------------------------------------

    // The route users will be redirected to when logged out.
    // If left undefined, it defaults to the application root (window.origin).
    loginRoute: "/login",

    // Refresh token endpoint. Update this to match your backend.
    refreshEndpoint: `${BASE_URL}/auth/refresh`,

    // ---------------------------------------------------------------------------
    // JWT / Bearer token authentication
    // Use these options when the `ReexProvider` auth strategy is `"jwt"`.
    // ---------------------------------------------------------------------------

    // Send the refresh token to your backend to obtain a new access token.
    // Rename `refreshToken` in the request body if your backend expects
    // a different field name (e.g. `refresh_token`).
    refreshWithToken: async (storedRefreshToken: string) =>
      axios.post(apiConfig.auth.refreshEndpoint, {
        refreshToken: storedRefreshToken,
      }),

    // Extract authentication tokens from your backend response.
    //
    // Note: `responseBody` is affected by the `unwrapResponseData` setting.
    // - When `unwrapResponseData` is `true`, `responseBody` contains the
    //   unwrapped `data` object.
    // - When `unwrapResponseData` is `false`, `responseBody` contains the
    //   full response body.
    //
    // Update these paths to match your API response structure.
    extractTokens: (responseBody: Record<string, unknown>) => ({
      accessToken: responseBody?.accessToken as string | undefined,
      refreshToken: responseBody?.refreshToken as string | undefined,
    }),

    // Storage key names for authentication tokens.
    // Change these if you prefer different key names.
    //
    // Note: The access token is stored in memory by default.
    // It is only persisted to localStorage if your backend does not
    // return a refresh token.
    accessTokenKey: "access_token",
    refreshTokenKey: "refresh_token",

    // ---------------------------------------------------------------------------
    // Cookie-based authentication
    // Use this when the `ReexProvider` auth strategy is `"cookie"`.
    // ---------------------------------------------------------------------------

    // Request a new access token using HttpOnly cookies.
    refreshWithCookie: async () =>
      axios.post(apiConfig.auth.refreshEndpoint, undefined, {
        withCredentials: true,

        // Add any headers required by your backend when refreshing tokens.
        // headers: { "X-Client-ID": "1234" },
      }),
  },
};