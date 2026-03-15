const express = require('express');
const cors = require('cors');
const sseService = require('./services/sse-service');
const watcherService = require('./services/watcher-service');
const generatorService = require('./services/generator-service');
const createFsRouter = require('./routes/fs-routes');
const createProjectRouter = require('./routes/project-routes');

function startServer(port) {
    const app = express();

    // CORS Configuration: Allow the Hosted UI to talk to us
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
        credentials: true
    }));

    app.use(express.json({ limit: '50mb' }));

    // Target Directory (from CLI args)
    let apiTargetDir = process.env.API_TARGET_DIR || process.cwd();

    // ---------------------------------------------------------
    // Services
    // ---------------------------------------------------------

    // SSE Endpoint
    app.get('/api/events', (req, res) => sseService.handleConnection(req, res));

    // File Watcher
    const watcher = watcherService.start(apiTargetDir);

    // Initial Generation
    if (apiTargetDir) {
        console.log("[STARTUP] Triggering initial generation...");
        generatorService.regenerate(apiTargetDir);
    }

    // ---------------------------------------------------------
    // Routes
    // ---------------------------------------------------------
    app.use('/api/fs', createFsRouter(apiTargetDir));
    app.use('/api/project', createProjectRouter(apiTargetDir));

    // Health Check
    app.get('/api/health', (req, res) => res.json({ status: 'ok', cwd: process.cwd(), targetDir: apiTargetDir, apiServicesDir: require('./paths').API_SERVICES_RELATIVE_DIR }));

    // Debug: Force Regeneration
    app.post('/api/debug/regenerate', (req, res) => {
        try {
            const result = generatorService.regenerate(apiTargetDir);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message, stack: e.stack });
        }
    });

    const server = app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });

    // Provide a graceful shutdown method for the CLI to use
    const shutdown = () => {
        console.log("\nClosing server and file watchers...");
        server.close();
        if (watcher && typeof watcher.close === 'function') {
            watcher.close();
        }
    };

    return { server, watcher, shutdown };
}

module.exports = { startServer };
