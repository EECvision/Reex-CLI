const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const projectService = require('./services/project-service');

// Setup upload storage (memory)
const uploadMemory = multer({ storage: multer.memoryStorage() });

function startServer(port) {
    const app = express();

    // CORS Configuration: Allow the Hosted UI to talk to us
    // MOVED INSIDE startServer to capture process.env set by CLI
    const allowedOrigins = (process.env.CORS_ORIGIN || "*").split(',');
    console.log("[CORS] Allowed Origins:", allowedOrigins);
    app.use(cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes("*")) {
                callback(null, true);
            } else {
                console.warn(`[CORS] Blocked request from: ${origin}`);
                callback(null, false); // Strict for now, maybe relax for localhost dev
            }
        },
        credentials: true // Important if we need cookies/headers
    }));

    app.use(express.json({ limit: '50mb' }));

    // Target Directory (from CLI args)
    let apiTargetDir = process.env.API_TARGET_DIR || process.cwd();

    // Ensure definitions/services structure exists if not present?
    // For now, we just respect the dir.

    // ---------------------------------------------------------
    // SSE Helper
    // ---------------------------------------------------------
    let clients = [];
    const sendEvent = (id, type, message) => {
        clients.forEach(res => res.write(`data: ${JSON.stringify({ id, type, message })}\n\n`));
    };

    app.get('/api/events', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        // CORS headers for SSE
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.flushHeaders();

        clients.push(res);
        req.on('close', () => {
            clients = clients.filter(c => c !== res);
        });
    });

    // ---------------------------------------------------------
    // File Watcher
    // ---------------------------------------------------------
    if (apiTargetDir) {
        console.log(`[WATCHER] Monitoring ${apiTargetDir}`);
        const watcher = chokidar.watch(apiTargetDir, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true
        });

        watcher.on('all', (event, filePath) => {
            // Debounce or just send raw?
            sendEvent(Date.now().toString(), 'project:updated', 'Project files changed');
        });
    }

    const router = express.Router();

    // Health Check
    router.get('/health', (req, res) => res.json({ status: 'ok', cwd: process.cwd(), targetDir: apiTargetDir }));

    // ---------------------------------------------------------
    // "Dumb" File Operations (The Bridge)
    // ---------------------------------------------------------

    // List Files (Project Structure)
    router.get('/project/files', async (req, res) => {
        // Implement valid file tree logic here or reuse projectService
        // For now, let's just return true to confirm connection
        res.json({ success: true, message: "Use /project/config or /project/modules" });
    });

    // Get Config
    router.get('/project/config', (req, res) => {
        const configDir = path.join(apiTargetDir, 'src', 'api-services', 'config'); // Assumption
        console.log(`[CONFIG] Reading from: ${configDir}`);
        try {
            const config = projectService.getProjectConfig(configDir);
            res.json(config);
        } catch (e) {
            console.error(`[CONFIG] Error:`, e);
            res.status(500).json({ error: e.message });
        }
    });

    // Get Modules
    router.get('/project/modules', (req, res) => {
        const definitionsDir = path.join(apiTargetDir, 'src', 'api-services', 'definitions'); // Assumption
        console.log(`[MODULES] Reading from: ${definitionsDir}`);
        try {
            const modules = projectService.getModules(definitionsDir);
            console.log(`[MODULES] Found:`, Object.keys(modules));
            res.json(modules);
        } catch (error) {
            console.error(`[MODULES] Error:`, error);
            res.status(500).json({ error: error.message });
        }
    });

    // Get Definitions Content (Smart Bridge Upgrade)
    router.get('/project/definitions', (req, res) => {
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

    // Save File (The "Write" Hand)
    // The Cloud UI sends code, we write it.
    router.post('/fs/write', async (req, res) => {
        try {
            const { filePath, content } = req.body; // filePath relative to targetDir

            // SECURITY: Prevent accessing files outside targetDir!
            const safePath = path.resolve(apiTargetDir, filePath);
            if (!safePath.startsWith(path.resolve(apiTargetDir))) {
                return res.status(403).json({ error: "Access Denied: Path traversal detected." });
            }

            // Ensure dir exists
            fs.mkdirSync(path.dirname(safePath), { recursive: true });
            fs.writeFileSync(safePath, content, 'utf8');

            console.log(`[FS] Wrote file: ${filePath}`);
            res.json({ success: true });
        } catch (e) {
            console.error(`[FS] Write Error:`, e);
            res.status(500).json({ error: e.message });
        }
    });

    // Read File (The "Read" Hand)
    // The Cloud UI might need to read `package.json` or `postman_collection.json`
    router.post('/fs/read', async (req, res) => {
        try {
            const { filePath } = req.body;
            const safePath = path.resolve(apiTargetDir, filePath);
            if (!safePath.startsWith(path.resolve(apiTargetDir))) {
                return res.status(403).json({ error: "Access Denied: Path traversal detected." });
            }

            if (!fs.existsSync(safePath)) return res.status(404).json({ error: "File not found" });

            const content = fs.readFileSync(safePath, 'utf8');
            res.json({ success: true, content });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Delete File/Folder (The "Delete" Hand)
    router.post('/fs/delete', async (req, res) => {
        try {
            const { filePath } = req.body;
            const safePath = path.resolve(apiTargetDir, filePath);
            if (!safePath.startsWith(path.resolve(apiTargetDir))) {
                return res.status(403).json({ error: "Access Denied: Path traversal detected." });
            }

            if (fs.existsSync(safePath)) {
                const stat = fs.statSync(safePath);
                if (stat.isDirectory()) {
                    fs.rmSync(safePath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(safePath);
                }
            }
            console.log(`[FS] Deleted: ${filePath}`);
            res.json({ success: true });
        } catch (e) {
            console.error(`[FS] Delete Error:`, e);
            res.status(500).json({ error: e.message });
        }
    });


    // ---------------------------------------------------------
    // Execution Proxy (Still needed?)
    // If the "Brain" is in the cloud, logic runs there.
    // BUT the user might want to run the generated code?
    // For now, let's keep it minimal.
    // ---------------------------------------------------------

    app.use('/api', router);

    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

module.exports = { startServer };
