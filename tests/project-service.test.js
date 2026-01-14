const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const projectService = require('../services/project-service');

test('Project Service Tests', async (t) => {
    // Setup Temp Dir
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-test-'));
    const definitionsDir = path.join(tmpDir, 'src', 'api-services', 'definitions'); // standard structure not strictly needed for service but good practice
    fs.mkdirSync(definitionsDir, { recursive: true });

    // Cleanup Helper
    t.after(() => {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (e) {
            console.warn("Cleanup failed", e);
        }
    });

    await t.test('generateManifest finds modules and functions', () => {
        const moduleName = 'users';
        const fileContent = `
            export const ${moduleName} = {
                 get_profile: (id: string) => { return true; },
                 post_update: (data: { name: string }) => { return true; }
            };
        `;
        fs.writeFileSync(path.join(definitionsDir, `${moduleName}.ts`), fileContent);

        const manifest = projectService.generateManifest(definitionsDir);

        // Assert Module Exists
        assert.ok(manifest[moduleName], 'Module should exist in manifest');

        // Assert Methods Exist
        assert.ok(manifest[moduleName].get_profile, 'get_profile should exist');
        assert.ok(manifest[moduleName].post_update, 'post_update should exist');

        // Assert Args
        assert.strictEqual(manifest[moduleName].get_profile.args.length, 1, 'get_profile should have 1 arg');
        assert.strictEqual(manifest[moduleName].get_profile.args[0].name, 'id', 'arg name should be id');
    });

    await t.test('generateManifest extracts metadata (Client/URL)', () => {
        const moduleName = 'orders';
        const fileContent = `
            export const ${moduleName} = {
                 get_list: () => { 
                     const url = "/orders"; 
                     return handleApiCall(() => API_CLIENT.get(url)); 
                 }
            };
        `;
        fs.writeFileSync(path.join(definitionsDir, `${moduleName}.ts`), fileContent);

        const manifest = projectService.generateManifest(definitionsDir);

        assert.ok(manifest[moduleName].get_list, 'get_list should exist');
        assert.strictEqual(manifest[moduleName].get_list.url, '/orders', 'URL should be extracted');
        assert.strictEqual(manifest[moduleName].get_list.client, 'API_CLIENT', 'Client should be extracted');
    });
});
