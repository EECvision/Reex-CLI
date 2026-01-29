const chokidar = require('chokidar');
const path = require('path');
const generatorService = require('./generator-service');
const sseService = require('./sse-service');

class WatcherService {
    /**
     * Start the definition watcher
     * @param {string} apiTargetDir 
     * @returns {Object} chokidar watcher instance
     */
    start(apiTargetDir) {
        console.log(`[WATCHER] Monitoring ${apiTargetDir}`);
        const watcher = chokidar.watch(apiTargetDir, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true
        });

        let debounceTimer;
        let isSyncing = false;

        watcher.on('all', (event, filePath) => {
            if (filePath.includes('generated')) return;
            if (filePath.includes('api-services' + path.sep + 'types')) return;

            // Ignore config/index.ts (barrel) to avoid loops
            if (filePath.endsWith('src' + path.sep + 'api-services' + path.sep + 'config' + path.sep + 'index.ts')) return;
            // Ignore config/clients.ts (managed by generator, prevents race condition)
            if (filePath.endsWith('src' + path.sep + 'api-services' + path.sep + 'config' + path.sep + 'clients.ts')) return;
            // Ignore config/core.ts and utils.ts (User managed implementation details, should not trigger regen)
            if (filePath.endsWith('src' + path.sep + 'api-services' + path.sep + 'config' + path.sep + 'core.ts')) return;
            if (filePath.endsWith('src' + path.sep + 'api-services' + path.sep + 'config' + path.sep + 'utils.ts')) return;

            // Also ignore src/api-services/index.ts (the main barrel)
            if (filePath.endsWith('src' + path.sep + 'api-services' + path.sep + 'index.ts')) return;

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
