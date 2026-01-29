const express = require('express');
const fs = require('fs');
const path = require('path');
const projectService = require('../services/project-service');
const generatorService = require('../services/generator-service');
const configService = require('../services/config-service');
const sseService = require('../services/sse-service');

const createProjectRouter = (apiTargetDir) => {
    const router = express.Router();

    // List Files (Project Structure)
    router.get('/files', async (req, res) => {
        res.json({ success: true, message: "Use /modules or /definitions" });
    });

    // Get Config
    router.get('/config', (req, res) => {
        const configDir = path.join(apiTargetDir, 'src', 'api-services', 'config');
        try {
            const config = projectService.getProjectConfig(configDir);
            res.json(config);
        } catch (e) {
            console.error(`[CONFIG] Error:`, e);
            res.status(500).json({ error: e.message });
        }
    });

    // Get Modules
    router.get('/modules', (req, res) => {
        const definitionsDir = path.join(apiTargetDir, 'src', 'api-services', 'definitions');
        try {
            const modules = projectService.getModules(definitionsDir);
            res.json(modules);
        } catch (error) {
            console.error(`[MODULES] Error:`, error);
            res.status(500).json({ error: error.message });
        }
    });

    // Get Definitions Content
    router.get('/definitions', (req, res) => {
        const definitionsDir = path.join(apiTargetDir, 'src', 'api-services', 'definitions');
        try {
            if (!fs.existsSync(definitionsDir)) {
                return res.json({});
            }
            const files = fs.readdirSync(definitionsDir).filter(f => f.endsWith('.ts'));
            const definitions = {};
            files.forEach(file => {
                const content = fs.readFileSync(path.join(definitionsDir, file), 'utf8');
                const moduleName = file.replace('.ts', '');
                definitions[moduleName] = content;
            });
            res.json(definitions);
        } catch (error) {
            console.error("Error reading definitions:", error);
            res.status(500).json({ error: error.message });
        }
    });

    // Get Manifest
    router.get('/manifest', (req, res) => {
        const definitionsDir = path.join(apiTargetDir, 'src', 'api-services', 'definitions');
        try {
            const manifest = projectService.generateManifest(definitionsDir);
            res.json(manifest);
        } catch (e) {
            console.error(`[MANIFEST] Error:`, e);
            res.status(500).json({ error: e.message });
        }
    });

    // Update Config (Upsert)
    router.post('/config/update', (req, res) => {
        try {
            const { baseUrl, clients } = req.body;
            const configDir = path.join(apiTargetDir, 'src', 'api-services', 'config');

            if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

            // 1. Update constants.ts (Base URL)
            const constantsPath = path.join(configDir, 'constants.ts');
            if (baseUrl) {
                const constantsContent = `
export const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || "${baseUrl}";
`;
                fs.writeFileSync(constantsPath, constantsContent);
            }

            // 2. Update Clients (Upsert)
            if (clients) {
                configService.updateClientsFile(apiTargetDir, clients, { prune: false });
            }

            // Trigger regeneration? NO. 
            // If we regenerate here, we might prune clients before their definitions are written (race condition).
            // We rely on the File Watcher to detect the subsequent write to 'definitions/' or 'constants.ts' to trigger regeneration.
            // generatorService.regenerate(apiTargetDir);

            // Event is broadcasted by regenerate()
            // But we can also send specific one. server.js had 'Configuration updated'
            sseService.broadcast(Date.now().toString(), 'project:updated', 'Configuration updated');

            res.json({ success: true });
        } catch (e) {
            console.error("[CONFIG] Update Error:", e);
            res.status(500).json({ error: e.message });
        }
    });

    // Sync Config (Prune)
    router.post('/config/sync', (req, res) => {
        try {
            console.log("[SYNC] Pruning unused clients...");
            const clientKeys = configService.updateClientsFile(apiTargetDir, {}, { prune: true });

            generatorService.regenerate(apiTargetDir);

            sseService.broadcast(Date.now().toString(), 'project:updated', 'Clients synchronized');

            res.json({ success: true, activeClients: clientKeys });
        } catch (e) {
            console.error("[SYNC] Error:", e);
            res.status(500).json({ error: e.message });
        }
    });

    return router;
};

module.exports = createProjectRouter;
