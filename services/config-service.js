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

        let currentContent = "";
        let existingClients = {};

        if (fs.existsSync(clientsPath)) {
            currentContent = fs.readFileSync(clientsPath, 'utf8');
            // Robust regex: allows single/double quotes, spaces, and optionally newlines
            const regex = /export\s+const\s+([a-zA-Z0-9_]+)\s+=\s+createClient\(\s*["']([^"']+)["']\s*\);/g;
            let match;
            while ((match = regex.exec(currentContent)) !== null) {
                existingClients[match[1]] = match[2];
            }
        }

        // Merge
        const mergedClients = { ...existingClients, ...newClientsMap };

        // Handle Pruning (Sync Mode)
        if (options.prune) {
            const definitionsDir = path.join(apiTargetDir, 'src', 'api-services', 'definitions');
            if (fs.existsSync(definitionsDir)) {
                const usedClients = new Set();
                const files = fs.readdirSync(definitionsDir).filter(f => f.endsWith('.ts'));

                files.forEach(file => {
                    const content = fs.readFileSync(path.join(definitionsDir, file), 'utf8');
                    const importMatch = content.match(/import\s+{([\s\S]+?)}\s+from\s+["']\.\.\/config["']/);
                    if (importMatch) {
                        const rawImports = importMatch[1].replace(/\n/g, ' ').replace(/\s+/g, ' ');
                        const importedItems = rawImports.split(',').map(s => s.trim()).filter(s => s);
                        importedItems.forEach(item => {
                            if (mergedClients[item]) usedClients.add(item);
                        });
                    }
                });

                Object.keys(mergedClients).forEach(key => {
                    if (!usedClients.has(key)) {
                        delete mergedClients[key];
                    }
                });
            } else {
                Object.keys(mergedClients).forEach(key => delete mergedClients[key]);
            }
        }

        // Re-generate File Content
        let newContent = `import { createClient } from "./core";\n\n`;
        const sortedKeys = Object.keys(mergedClients).sort();

        if (sortedKeys.length === 0) {
            newContent += `// No clients currently used\n`;
        } else {
            sortedKeys.forEach(name => {
                newContent += `export const ${name} = createClient("${mergedClients[name]}");\n`;
            });
        }

        if (currentContent.trim() !== newContent.trim()) {
            fs.writeFileSync(clientsPath, newContent);
            console.log(`[ConfigService] Updated clients.ts (Content Changed)`);
        }

        return Object.keys(mergedClients);
    }
}

module.exports = new ConfigService();
