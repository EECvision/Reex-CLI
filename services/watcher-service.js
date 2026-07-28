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
        const apiServicesDir = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR);
        const definitionsDir = path.join(apiServicesDir, 'definitions');
        const constantsPath = path.join(apiServicesDir, 'api.config.ts');

        console.log(`[WATCHER] Monitoring:\n - ${definitionsDir}\n - ${constantsPath}`);

        // We watch the entire apiServicesDir to survive atomic saves (e.g. from VS Code), 
        // but we aggressively filter events in the handler below.
        const watcher = chokidar.watch(apiServicesDir, {
            ignoreInitial: true,
            persistent: true
        });

        let debounceTimer;
        let configDebounceTimer;
        let isSyncing = false;
        let changedFiles = new Set();

        watcher.on('all', (event, filePath) => {
            const isDefinitions = filePath.includes(path.join(API_SERVICES_RELATIVE_DIR, 'definitions'));
            const isApiConfig = filePath.endsWith('api.config.ts');

            // Ignore everything that is not a definition or api.config.ts
            if (!isDefinitions && !isApiConfig) return;

            // Ignore changes to generated files within definitions/ (e.g. index.ts)
            // to prevent an infinite loop where the generator triggers itself.
            if (isDefinitions && path.basename(filePath) === 'index.ts') return;

            console.log(`[WATCHER] Change detected: ${event} ${filePath}`);

            if (isApiConfig) {
                clearTimeout(configDebounceTimer);
                configDebounceTimer = setTimeout(() => {
                    console.log(`[WATCHER] Config updated, notifying UI to sync.`);
                    sseService.broadcast(Date.now().toString(), 'project:updated', 'Configuration updated');
                }, 500);
                return;
            }

            if (!isSyncing) {
                sseService.broadcast(Date.now().toString(), 'project:sync-start', 'Syncing changes...');
                isSyncing = true;
            }

            changedFiles.add(filePath);

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                const filesToProcess = Array.from(changedFiles);
                changedFiles.clear();

                let changedModules = [];
                for (const file of filesToProcess) {
                    if (file.includes('definitions')) {
                        const basename = path.basename(file, '.ts');
                        if (basename !== 'index') changedModules.push(basename);
                    }
                }
                
                if (changedModules.length > 0) {
                    changedModules = [...new Set(changedModules)];
                } else {
                    changedModules = null; // trigger full rebuild if unknown files changed
                }

                try {
                    await generatorService.regenerate(apiTargetDir, changedModules);
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
