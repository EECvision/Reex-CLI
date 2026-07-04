const chokidar = require('chokidar');
const path = require('path');
const { API_SERVICES_RELATIVE_DIR } = require('../paths');
const generatorService = require('./generator-service');
const sseService = require('./sse-service');

class WatcherService {
    /**
     * Start the definition watcher
     * @param {string} apiTargetDir 
     * @returns {Object} chokidar watcher instance
     */
    start(apiTargetDir) {
        const definitionsDir = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR, 'definitions');
        const constantsPath = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR, 'api.config.ts');

        console.log(`[WATCHER] Monitoring:\n - ${definitionsDir}\n - ${constantsPath}`);

        // Watch ONLY the source inputs. 
        // We do NOT watch generated files (clients.ts, core.ts, types, hooks, index.ts).
        const watcher = chokidar.watch([definitionsDir, constantsPath], {
            ignoreInitial: true,
            persistent: true
        });

        let debounceTimer;
        let isSyncing = false;

        watcher.on('all', (event, filePath) => {
            // Even though we scope the watch, be safe.
            if (filePath.includes('generated') || filePath.endsWith('index.ts')) return;

            console.log(`[WATCHER] Change detected: ${event} ${filePath}`);

            // Immediate Feedback: Notify client that we see changes
            if (!isSyncing) {
                sseService.broadcast(Date.now().toString(), 'project:sync-start', 'Syncing changes...');
                isSyncing = true;
            }

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                try {
                    generatorService.regenerate(apiTargetDir);
                } catch (e) {
                    console.error("Regeneration failed:", e);
                } finally {
                    isSyncing = false;
                }
            }, 1000);
        });

        return watcher;
    }
}

module.exports = new WatcherService();
