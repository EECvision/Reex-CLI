const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { startServer } = require('../server');

test('Bridge Server Integration Tests', async (t) => {
    // Setup Temp Dir
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-test-'));
    const definitionsDir = path.join(tmpDir, 'api-services', 'definitions');
    const generatedDir = path.join(tmpDir, 'api-services', 'generated');
    const configDir = path.join(tmpDir, 'api-services', 'config');

    fs.mkdirSync(definitionsDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
        name: 'test-app',
        dependencies: { react: '^18.0.0' }
    }));

    // Create Dummy Definition
    const moduleName = "serverTestUsers";
    fs.writeFileSync(path.join(definitionsDir, `${moduleName}.ts`), `
        export const ${moduleName} = {
            get_test: () => true
        };
    `);

    // Override Env
    process.env.API_TARGET_DIR = tmpDir;

    // Start Server
    const PORT = 5002; // Use distinct port
    const { server, watcher } = startServer(PORT);
    const BASE_URL = `http://localhost:${PORT}/api`;

    // Wait for startup generation (async)
    await new Promise(r => setTimeout(r, 2000));

    const waitForFile = async (filePath, timeout = 5000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (fs.existsSync(filePath)) return true;
            await new Promise(r => setTimeout(r, 100));
        }
        return false;
    };

    // Cleanup Helper
    t.after(async () => {
        server.close();
        if (watcher) await watcher.close();
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (e) { }
    });

    await t.test('Health Check', async () => {
        const res = await fetch(`${BASE_URL}/health`);
        const data = await res.json();
        assert.strictEqual(data.status, 'ok');
        assert.ok(data.targetDir.includes('server-test'));
    });

    await t.test('Config Scaffolding', async () => {
        // Assert api.config.ts was created on startup
        const apiConfigPath = path.join(tmpDir, 'api-services', 'api.config.ts');
        const exists = await waitForFile(apiConfigPath);
        assert.ok(exists, 'api.config.ts should have been scaffolded');

        const content = fs.readFileSync(apiConfigPath, 'utf8');
        assert.ok(content.includes('baseURL'), 'Config should contain baseURL');

        // Assert core.ts
        const corePath = path.join(tmpDir, 'api-services', 'core.ts');
        assert.ok(fs.existsSync(corePath), 'core.ts should have been scaffolded');
    });

    await t.test('Generated Folder Restoration', async () => {
        // Assert hooks directory exists
        const hooksDir = path.join(tmpDir, 'api-services', 'hooks');
        const exists = await waitForFile(hooksDir);
        assert.ok(exists, 'Hooks folder should exist');
    });

    await t.test('Fetch Manifest', async () => {
        const res = await fetch(`${BASE_URL}/project/manifest`);
        const manifest = await res.json();

        assert.ok(manifest[moduleName], 'Manifest should contain test module');
        assert.ok(manifest[moduleName].get_test, 'Manifest should contain test method');
    });

    await t.test('Batch File Operations', async () => {
        const batchRes = await fetch(`${BASE_URL}/fs/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operations: [
                    { type: 'write', filePath: 'api-services/definitions/batchModuleA.ts', content: 'export const batchModuleA = {};' },
                    { type: 'write', filePath: 'api-services/definitions/batchModuleB.ts', content: 'export const batchModuleB = {};' },
                ]
            })
        });
        const batchData = await batchRes.json();
        assert.strictEqual(batchData.success, true);
        assert.strictEqual(batchData.count, 2);

        assert.ok(fs.existsSync(path.join(tmpDir, 'api-services', 'definitions', 'batchModuleA.ts')));
        assert.ok(fs.existsSync(path.join(tmpDir, 'api-services', 'definitions', 'batchModuleB.ts')));

        // Test delete via batch
        const deleteRes = await fetch(`${BASE_URL}/fs/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operations: [
                    { type: 'delete', filePath: 'api-services/definitions/batchModuleB.ts' }
                ]
            })
        });
        const deleteData = await deleteRes.json();
        assert.strictEqual(deleteData.success, true);
        assert.ok(!fs.existsSync(path.join(tmpDir, 'api-services', 'definitions', 'batchModuleB.ts')));
    });

    await t.test('Config Sync with changedModules', async () => {
        const syncRes = await fetch(`${BASE_URL}/project/config/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ changedModules: ['serverTestUsers'] })
        });
        const syncData = await syncRes.json();
        assert.strictEqual(syncData.success, true);
    });

    await t.test('Debug Regenerate', async () => {
        // Trigger manually
        const res = await fetch(`${BASE_URL}/debug/regenerate`, { method: 'POST' });
        const data = await res.json();

        assert.strictEqual(data.success, true);
        assert.ok(data.manifestKeys.includes(moduleName));
    });
});
