const express = require('express');
const fs = require('fs');
const path = require('path');
const { API_SERVICES_RELATIVE_DIR } = require('../paths');
const projectService = require('../services/project-service');
const generatorService = require('../services/generator-service');

const sseService = require('../services/sse-service');

const createProjectRouter = (apiTargetDir) => {
    const router = express.Router();

    // List Files (Project Structure)
    router.get('/files', async (req, res) => {
        res.json({ success: true, message: "Use /modules or /definitions" });
    });

    // Get Config
    router.get('/config', (req, res) => {
        try {
            const config = projectService.getProjectConfig(apiTargetDir);
            res.json(config);
        } catch (e) {
            console.error(`[CONFIG] Error:`, e);
            res.status(500).json({ error: e.message });
        }
    });

    // Get Modules
    router.get('/modules', (req, res) => {
        const definitionsDir = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR, 'definitions');
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
        const definitionsDir = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR, 'definitions');
        try {
            if (!fs.existsSync(definitionsDir)) {
                return res.json({});
            }
            const files = fs.readdirSync(definitionsDir).filter(f => f.endsWith('.ts') && f !== 'index.ts');
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
        const definitionsDir = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR, 'definitions');
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
            const { baseUrl, clients, collectionName } = req.body;
            const reexDir = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR, '.reex');
            if (!fs.existsSync(reexDir)) fs.mkdirSync(reexDir, { recursive: true });

            // 1. Update api.config.ts (Base URL)
            const apiConfigPath = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR, 'api.config.ts');
            if (baseUrl && fs.existsSync(apiConfigPath)) {
                let apiConfigContent = fs.readFileSync(apiConfigPath, 'utf8');
                apiConfigContent = apiConfigContent.replace(/baseURL:\s*".*"/, `baseURL: "${baseUrl}"`);
                fs.writeFileSync(apiConfigPath, apiConfigContent);
            }

            // 2. Clients — no longer written here.
            // The API client is now a static config/index.ts managed by the generator.

            // 3. Update metadata.json (Collection Name and other metadata)
            if (collectionName) {
                const metadataPath = path.join(reexDir, 'metadata.json');
                let metadata = {};
                if (fs.existsSync(metadataPath)) {
                    try {
                        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                    } catch (e) {
                        console.warn('[CONFIG] Failed to parse existing metadata.json:', e);
                    }
                }
                metadata.collectionName = collectionName;
                fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            }

            // Trigger regeneration? NO. 
            // If we regenerate here, we might prune clients before their definitions are written (race condition).
            // We rely on the File Watcher to detect the subsequent write to 'definitions/' or 'constants.ts' to trigger regeneration.
            // generatorService.regenerate(apiTargetDir);

            // Event is broadcasted by regenerate() (via watcher)
            // But we can also send specific one. server.js had 'Configuration updated'
            // sseService.broadcast(Date.now().toString(), 'project:updated', 'Configuration updated');

            res.json({ success: true });
        } catch (e) {
            console.error("[CONFIG] Update Error:", e);
            res.status(500).json({ error: e.message });
        }
    });



    return router;
};

module.exports = createProjectRouter;
