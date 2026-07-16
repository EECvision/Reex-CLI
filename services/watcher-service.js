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
        let configDebounceTimer;
        let isSyncing = false;
        let changedFiles = new Set();

        watcher.on('all', (event, filePath) => {
            if (filePath.includes('generated') || filePath.endsWith('index.ts')) return;

            console.log(`[WATCHER] Change detected: ${event} ${filePath}`);

            if (filePath.endsWith('api.config.ts')) {
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
