const fs = require('fs');
const path = require('path');

class ConfigService {

    /**
     * Generate/Update clients.ts
     * 1. Read existing clients (simple regex parse)
     * 2. Merge new proposed clients
     * 3. (Optional) Filter by usage if syncing
     * 
     * @param {string} apiTargetDir 
     * @param {Object} newClientsMap 
     * @param {Object} options { prune: boolean }
     */
    updateClientsFile(apiTargetDir, newClientsMap, options = { prune: false }) {
        const configDir = path.join(apiTargetDir, 'src', 'api-services', 'config');
        const clientsPath = path.join(configDir, 'clients.ts');

        if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

        // Force Single Client Generation
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

        const currentContent = fs.existsSync(clientsPath) ? fs.readFileSync(clientsPath, 'utf8') : "";

        if (currentContent.trim() !== clientsContent.trim()) {
            fs.writeFileSync(clientsPath, newContent);
            console.log(`[ConfigService] Updated clients.ts (Content Changed)`);
        }

        return ["apiClient"];
    }
}

module.exports = new ConfigService();
