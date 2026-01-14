const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { startServer } = require('../server');

test('Bridge Server Integration Tests', async (t) => {
    // Setup Temp Dir
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-test-'));
    const definitionsDir = path.join(tmpDir, 'src', 'api-services', 'definitions');
    const generatedDir = path.join(tmpDir, 'src', 'api-services', 'generated');
    const configDir = path.join(tmpDir, 'src', 'api-services', 'config');

    fs.mkdirSync(definitionsDir, { recursive: true });

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

    await t.test('Config Scaffolding', () => {
        // Assert config/index.ts was created on startup
        assert.ok(fs.existsSync(path.join(configDir, 'index.ts')), 'Config file should have been scaffolded');
        const content = fs.readFileSync(path.join(configDir, 'index.ts'), 'utf8');
        assert.ok(content.includes('export const baseURL'), 'Config should contain default baseURL');
    });

    await t.test('Generated Folder Restoration', () => {
        // Assert generated/index.ts exists
        assert.ok(fs.existsSync(path.join(generatedDir, 'index.ts')), 'Generated index should exist');
        assert.ok(fs.existsSync(path.join(generatedDir, `use${moduleName.charAt(0).toUpperCase()}${moduleName.slice(1)}Queries.ts`)), 'Generated module hooks should exist');
    });

    await t.test('Fetch Manifest', async () => {
        const res = await fetch(`${BASE_URL}/project/manifest`);
        const manifest = await res.json();

        assert.ok(manifest[moduleName], 'Manifest should contain test module');
        assert.ok(manifest[moduleName].get_test, 'Manifest should contain test method');
    });

    await t.test('Debug Regenerate', async () => {
        // Trigger manually
        const res = await fetch(`${BASE_URL}/debug/regenerate`, { method: 'POST' });
        const data = await res.json();

        assert.strictEqual(data.success, true);
        assert.ok(data.manifestKeys.includes(moduleName));
    });
});
