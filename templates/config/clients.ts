
import { createApiClient } from "./core";
import { cookieTokenProvider } from "../providers/CookieAuth/CookieTokenProvider";

// Choose the appropriate token provider for your authentication strategy:

// Option 1: Cookie-based auth (default)
// Server manages refresh tokens via httpOnly cookies
export const apiClient = createApiClient(cookieTokenProvider);

// Option 2: NextAuth.js
// Uncomment if using NextAuth.js for session management:
// import { nextAuthTokenProvider } from "../providers/NextAuth/NextAuthTokenProvider";
// export const apiClient = createApiClient(nextAuthTokenProvider);

// Option 3: LocalStorage-based auth
// Client-side token management with refresh token in localStorage:
// import { localStorageTokenProvider } from "../providers/LocalStorageAuth/LocalStorageTokenProvider";
// export const apiClient = createApiClient(localStorageTokenProvider);
// Note: Call localStorageTokenProvider.setTokens() after login
// Call localStorageTokenProvider.clearTokens() on logout
