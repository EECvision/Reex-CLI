const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const projectService = require('./services/project-service');
const typeService = require('./services/type-service');

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

        console.log("[SSE] New Client Connected");
        clients.push(res);
        req.on('close', () => {
            clients = clients.filter(c => c !== res);
        });
    });

    // ---------------------------------------------------------
    // File Operations Router
    // ---------------------------------------------------------
    const router = express.Router();

    // ---------------------------------------------------------
    // File Watcher
    // ---------------------------------------------------------
    let watcher = null;
    if (apiTargetDir) {
        console.log(`[WATCHER] Monitoring ${apiTargetDir}`);
        watcher = chokidar.watch(apiTargetDir, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true
        });

        // Regeneration Helper
        const regenerate = () => {
            const definitionsDir = path.join(apiTargetDir, 'src', 'api-services', 'definitions');
            const configDir = path.join(apiTargetDir, 'src', 'api-services', 'config');
            const indexTimePath = path.join(configDir, 'index.ts'); // The barrel
            const constantsPath = path.join(configDir, 'constants.ts'); // NEW: Base URL
            const corePath = path.join(configDir, 'core.ts');       // Interceptors (User Managed)
            const clientsPath = path.join(configDir, 'clients.ts'); // Clients (Generator Managed)
            const utilsPath = path.join(configDir, 'utils.ts');

            try {
                console.log("[WATCHER] Regenerating Manifest & Hooks...");

                if (!fs.existsSync(configDir)) {
                    fs.mkdirSync(configDir, { recursive: true });
                }

                // 1. constants.ts - Managed by Bridge (Base URL)
                if (!fs.existsSync(constantsPath)) {
                    const constantsContent = `
export const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.example.com";
`;
                    fs.writeFileSync(constantsPath, constantsContent);
                    console.log("[WATCHER] Scaffoled config/constants.ts");
                }

                // 2. core.ts - User Managed (Interceptors), imports constants
                if (!fs.existsSync(corePath)) {
                    const coreContent = `
import axios, {
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from "axios";
import { baseURL } from "./constants";

const DEFAULT_CONFIG = {
  baseURL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
};

// 1. Create a factory function to avoid repeating interceptor logic
export const createClient = (path: string = ""): AxiosInstance => {
  const client = axios.create({
    ...DEFAULT_CONFIG,
    baseURL: path ? \`\${baseURL}\${path}\` : baseURL,
  });

  // Request Interceptor: Auth
  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    if (typeof window !== "undefined") {
      // You might pull this from a redux or zustand store or a cookie helper
      const token = localStorage.getItem("token");
      if (token && config.headers) {
        config.headers.Authorization = \`Bearer \${token}\`;
      }
    }
    return config;
  });

  // Response Interceptor: Error Handling
  client.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error: AxiosError) => {
      return Promise.reject(error);
    },
  );

  return client;
};

// 2. Base Client (Core Identity)
export const BASE_CLIENT = createClient();
`;
                    fs.writeFileSync(corePath, coreContent);
                    console.log("[WATCHER] Scaffoled config/core.ts");
                }

                // ... (rest of function)



                // clients.ts - SCAFFOLD ONLY (Generator manages this)
                if (!fs.existsSync(clientsPath)) {
                    const clientsContent = `
import { createClient } from "./core";

// Auto-generated clients will be added here
`;
                    fs.writeFileSync(clientsPath, clientsContent);
                    console.log("[WATCHER] Scaffoled config/clients.ts");
                }


                // index.ts - BARREL ONLY (Managed by Bridge)
                const indexContent = `
export * from "./core";
export * from "./clients";
export * from "./utils";
`;
                fs.writeFileSync(indexTimePath, indexContent);
                console.log("[WATCHER] Updated config/index.ts");


                // utils.ts
                if (!fs.existsSync(utilsPath)) {
                    const utilsContent = `
import { AxiosResponse, isAxiosError } from "axios";

export interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
  originalError?: unknown; // Optional: useful for debugging
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

/**
 * Standard API Wrapper
 */
export const handleApiCall = async <T>(
  fn: () => Promise<AxiosResponse<T>>,
  label: string,
): Promise<ApiResponse<T>> => {
  try {
    const res = await fn();
    return { data: res.data };
  } catch (err: unknown) {
    return { error: handleError(err, label) };
  }
};

export const handleError = (error: unknown, label: string): ApiError => {
  let message = "An unexpected error occurred";
  let code: string | undefined;
  let statusCode: number | undefined;

  if (isAxiosError(error)) {
    const data = error.response?.data;
    message = data?.message || error.message || message;
    code = data?.code;
    statusCode = error.response?.status;
  } else if (error instanceof Error) {
    message = error.message;
  }

  console.error(\`[API ERROR - \${label}]\`, { message, code, statusCode });
  return { message, code, statusCode };
};

/**
 * Handle query params
 */
export const constructQueryParams = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>,
): string => {
  const params = new URLSearchParams();

  Object.entries(payload).forEach(([k, v]) => {
    if (
      v !== undefined &&
      v !== null &&
      v !== "" &&
      !(Array.isArray(v) && v.length === 0)
    ) {
      params.append(k, String(v));
    }
  });

  const query = params.toString();
  return query ? \`?\${query}\` : "";
};
`;
                    fs.writeFileSync(utilsPath, utilsContent);
                    console.log("[WATCHER] Scaffoled config/utils.ts");
                }

                // 2. Generate Manifest
                const manifest = projectService.generateManifest(definitionsDir);

                // 3. Generate Hooks
                const hookService = require('./services/hook-service');
                hookService.generateHooks(apiTargetDir, manifest);

                // 3b. Generate Types Folder
                typeService.generateTypes(apiTargetDir, manifest);

                // 3c. Sync Clients (Auto-Prune unused clients)
                // This ensures clients.ts always matches the definitions, handling manual deletions or UI deletions.
                updateClientsFile({}, { prune: true });

                // 4. Regenerate Barrel File (src/api-services/index.ts)
                const moduleNames = Object.keys(manifest).sort();
                const barrelContent = `export * from "./config";
export * from "./config/utils";

${moduleNames.map((name) => `import { ${name}Api } from "./definitions/${name}";`).join('\n')}

export const apiClient = {
${moduleNames.map((name) => `  ...${name}Api,`).join('\n')}
};
`;
                const barrelPath = path.join(apiTargetDir, 'src', 'api-services', 'index.ts');
                fs.writeFileSync(barrelPath, barrelContent);
                console.log("[WATCHER] Regenerated src/api-services/index.ts");

                sendEvent(Date.now().toString(), 'project:updated', 'Project generated');
                console.log("[WATCHER] Regeneration Complete");
                return { success: true, manifestKeys: moduleNames };
            } catch (e) {
                console.error("[WATCHER] Regeneration Failed:", e);
                throw e;
            }
        };

        let debounceTimer;
        let isSyncing = false;

        watcher.on('all', (event, filePath) => {
            if (filePath.includes('generated')) return;
            if (filePath.includes('api-services' + path.sep + 'types')) return;
            // Ignore config/index.ts (barrel) to avoid loops, but allow core.ts and clients.ts
            if (filePath.endsWith('src' + path.sep + 'api-services' + path.sep + 'config' + path.sep + 'index.ts')) return;
            // Also ignore src/api-services/index.ts (the main barrel)
            if (filePath.endsWith('src' + path.sep + 'api-services' + path.sep + 'index.ts')) return;

            // Immediate Feedback: Notify client that we see changes
            if (!isSyncing) {
                sendEvent(Date.now().toString(), 'project:sync-start', 'Syncing changes...');
                isSyncing = true;
            }

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                try {
                    regenerate();
                } catch (e) {
                    console.error("Regeneration failed:", e);
                } finally {
                    isSyncing = false;
                }
            }, 1000);
        });

        // Debug Endpoint to force regeneration
        router.post('/debug/regenerate', (req, res) => {
            try {
                const result = regenerate();
                res.json(result);
            } catch (e) {
                res.status(500).json({ error: e.message, stack: e.stack });
            }
        });
    }

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

    // Get Manifest (Smart Bridge Upgrade)
    router.get('/project/manifest', (req, res) => {
        const definitionsDir = path.join(apiTargetDir, 'src', 'api-services', 'definitions');
        console.log(`[MANIFEST] Generating from: ${definitionsDir}`);
        try {
            const manifest = projectService.generateManifest(definitionsDir);
            res.json(manifest);
        } catch (e) {
            console.error(`[MANIFEST] Error:`, e);
            res.status(500).json({ error: e.message });
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

    // List Files (The "Scan" Hand)
    router.post('/fs/list', async (req, res) => {
        try {
            const { filePath } = req.body;
            const safePath = path.resolve(apiTargetDir, filePath);
            if (!safePath.startsWith(path.resolve(apiTargetDir))) {
                return res.status(403).json({ error: "Access Denied: Path traversal detected." });
            }

            if (!fs.existsSync(safePath)) return res.json({ success: true, files: [] });

            const files = fs.readdirSync(safePath);
            res.json({ success: true, files });
        } catch (e) {
            console.error(`[FS] List Error:`, e);
            res.status(500).json({ error: e.message });
        }
    });

    // ---------------------------------------------------------
    // Config Management (Bridge-Driven)
    // ---------------------------------------------------------

    // Helper: Generate/Update clients.ts
    // We now maintain a structured approach:
    // 1. Read existing clients (simple regex parse)
    // 2. Merge new proposed clients
    // 3. (Optional) Filter by usage if syncing
    const updateClientsFile = (newClientsMap, options = { prune: false }) => {
        const configDir = path.join(apiTargetDir, 'src', 'api-services', 'config');
        const clientsPath = path.join(configDir, 'clients.ts');

        if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

        let currentContent = "";
        let existingClients = {};

        if (fs.existsSync(clientsPath)) {
            currentContent = fs.readFileSync(clientsPath, 'utf8');
            // Robust regex: allows single/double quotes, spaces, and optionally newlines (though strict createClient format is usually one line)
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
                    // Look for imports from "../config"
                    // import { CLIENT_NAME, ... } from "../config";
                    // Supports multi-line imports and single/double quotes
                    const importMatch = content.match(/import\s+{([\s\S]+?)}\s+from\s+["']\.\.\/config["']/);
                    if (importMatch) {
                        // Cleanup: Remove newlines, weird spaces
                        const rawImports = importMatch[1].replace(/\n/g, ' ').replace(/\s+/g, ' ');
                        const importedItems = rawImports.split(',').map(s => s.trim()).filter(s => s);
                        importedItems.forEach(item => {
                            // If it matches a known client name, keep it
                            if (mergedClients[item]) usedClients.add(item);
                        });
                    }
                });

                // Filter mergedClients to only used ones
                Object.keys(mergedClients).forEach(key => {
                    if (!usedClients.has(key)) {
                        delete mergedClients[key];
                    }
                });
            } else {
                // No definitions? Clear all clients.
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
            console.log(`[WATCHER] Updated clients.ts (Content Changed)`);
        } else {
            // console.log(`[WATCHER] Skipped clients.ts (No Change)`);
        }
        return Object.keys(mergedClients);
    };

    // Endpoint: Update Config (Upsert)
    // Called BEFORE generating definitions (to ensure exports exist)
    router.post('/project/config/update', (req, res) => {
        try {
            const { baseUrl, clients } = req.body;
            const configDir = path.join(apiTargetDir, 'src', 'api-services', 'config');
            const corePath = path.join(configDir, 'core.ts');

            if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

            // 1. Update Core (Base URL)
            // We use a simplified template replacement or rewrite if it doesn't exist/matches template
            // For robustness, we'll rewrite using the known template if we're managing it.
            // But if user modified it manually, we might overwrite? 
            // The requirement is "Bridge is single source of truth". So we overwrite.
            if (baseUrl) {
                const coreContent = `
import axios, {
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from "axios";

// Managed by API Builder
const baseURL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "${baseUrl}";

const DEFAULT_CONFIG = {
  baseURL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
};

export const createClient = (path: string = ""): AxiosInstance => {
  const client = axios.create({
    ...DEFAULT_CONFIG,
    baseURL: path ? \`\${baseURL}\${path}\` : baseURL,
  });

  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      if (token && config.headers) {
        config.headers.Authorization = \`Bearer \${token}\`;
      }
    }
    return config;
  });

  client.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error: AxiosError) => {
      return Promise.reject(error);
    },
  );

  return client;
};

export const BASE_CLIENT = createClient();
`;
                fs.writeFileSync(corePath, coreContent);
            }

            // 2. Update Clients (Upsert)
            if (clients) {
                updateClientsFile(clients, { prune: false });
            }

            // Trigger regeneration (Barrel files etc)
            if (typeof regenerate === 'function') regenerate();

            sendEvent(Date.now().toString(), 'project:updated', 'Configuration updated');

            res.json({ success: true });
        } catch (e) {
            console.error("[CONFIG] Update Error:", e);
            res.status(500).json({ error: e.message });
        }
    });

    // Endpoint: Sync Config (Prune)
    // Called AFTER definition changes (to remove unused)
    router.post('/project/config/sync', (req, res) => {
        try {
            console.log("[SYNC] Pruning unused clients...");
            const clientKeys = updateClientsFile({}, { prune: true });

            // Trigger regeneration to ensure index.ts is clean
            if (typeof regenerate === 'function') regenerate();

            sendEvent(Date.now().toString(), 'project:updated', 'Clients synchronized');

            res.json({ success: true, activeClients: clientKeys });
        } catch (e) {
            console.error("[SYNC] Error:", e);
            res.status(500).json({ error: e.message });
        }
    });

    app.use('/api', router);

    const server = app.listen(port, () => {

        console.log(`Server running at http://localhost:${port}`);
        if (apiTargetDir && typeof regenerate === 'function') {
            console.log("[STARTUP] Triggering initial generation...");
            regenerate();
        }
    });

    return { server, watcher };
}

module.exports = { startServer };
