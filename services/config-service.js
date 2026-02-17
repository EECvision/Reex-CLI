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
        const templateClientsPath = path.join(__dirname, '../templates/config/clients.ts');
        let clientsContent = "";

        if (fs.existsSync(templateClientsPath)) {
            clientsContent = fs.readFileSync(templateClientsPath, 'utf8');
        } else {
            // Fallback if template missing (should not happen if set up correctly)
            console.warn("[ConfigService] Warning: templates/config/clients.ts not found. Using fallback.");
            clientsContent = `
 import { createApiClient } from "./core";
 import { cookieTokenProvider } from "../providers/CookieAuth/CookieTokenProvider";
 
 export const apiClient = createApiClient(cookieTokenProvider);
 `;
        }

        const currentContent = fs.existsSync(clientsPath) ? fs.readFileSync(clientsPath, 'utf8') : "";

        if (currentContent.trim() !== clientsContent.trim()) {
            fs.writeFileSync(clientsPath, clientsContent);
            console.log(`[ConfigService] Updated clients.ts (Content Changed)`);
        }

        return ["apiClient"];
    }
}

module.exports = new ConfigService();
