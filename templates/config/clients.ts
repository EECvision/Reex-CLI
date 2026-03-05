// @user-config — changes needed: Uncomment the auth strategy that matches your setup

/**
 * Available auth strategies:
 *   cookieTokenProvider       → httpOnly cookie, server-managed refresh tokens
 *   nextAuthTokenProvider     → NextAuth.js session management
 *   localStorageTokenProvider → client-side token storage with refresh in localStorage
 */

import { createApiClient } from "./core";
// import { cookieTokenProvider }        from "../auth/CookieAuth/CookieTokenProvider";
// import { nextAuthTokenProvider }      from "../auth/NextAuth/NextAuthTokenProvider";
import { localStorageTokenProvider } from "../auth/LocalStorageAuth/LocalStorageTokenProvider";

export const activeTokenProvider = localStorageTokenProvider;

/** Configured API client using the active token provider */
export const apiClient = createApiClient(activeTokenProvider);
