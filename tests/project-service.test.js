const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const projectService = require('../services/project-service');

test('Project Service Tests', async (t) => {
    // Setup Temp Dir
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-test-'));
    const definitionsDir = path.join(tmpDir, 'api-services', 'definitions'); // standard structure not strictly needed for service but good practice
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
            import { apiClient } from '../config/core';
            export const ${moduleName} = {
                 get_list: () => apiClient.get(\`/orders\`)
            };
        `;
        fs.writeFileSync(path.join(definitionsDir, `${moduleName}.ts`), fileContent);

        const manifest = projectService.generateManifest(definitionsDir);

        assert.ok(manifest[moduleName].get_list, 'get_list should exist');
        assert.strictEqual(manifest[moduleName].get_list.url, '/orders', 'URL should be extracted');
        assert.strictEqual(manifest[moduleName].get_list.client, 'apiClient', 'Client should be extracted');
    });

    await t.test('generateManifest expands recursive types', async () => {
        const definitionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-service-types-'));
        t.after(() => fs.rmSync(definitionsDir, { recursive: true, force: true }));

        fs.writeFileSync(path.join(definitionsDir, 'complexTypes.ts'), `
            import { BASE_CLIENT } from '../config/utils';

            interface Address {
                street: string;
                city: string;
            }

            interface User {
                id: string;
                address: Address;
            }

            export const complexTypesApi = {
                createUser: (data: { name: string, metadata: { role: string } }, profile: User) => 
                    BASE_CLIENT.post('/users', { data })
            };
        `);

        const manifest = projectService.generateManifest(definitionsDir);
        const method = manifest.complexTypes.createUser;

        assert.strictEqual(method.args[0].name, 'data');
        assert.strictEqual(method.args[0].isObject, true);
        assert.strictEqual(method.args[0].properties[0].name, 'name');
        assert.strictEqual(method.args[0].properties[1].name, 'metadata');
        assert.strictEqual(method.args[0].properties[1].isObject, true);
        assert.strictEqual(method.args[0].properties[1].properties[0].name, 'role');

        const profileArg = method.args[1];
        assert.strictEqual(profileArg.name, 'profile');
        assert.strictEqual(profileArg.isObject, true);
        assert.strictEqual(profileArg.properties[0].name, 'id');
        assert.strictEqual(profileArg.properties[1].name, 'address');
        assert.strictEqual(profileArg.properties[1].isObject, true);
        assert.strictEqual(profileArg.properties[1].properties[0].name, 'street');
    });

    await t.test('generateManifest caches result and invalidates when files change', async () => {
        const cacheTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-cache-test-'));
        t.after(() => fs.rmSync(cacheTestDir, { recursive: true, force: true }));

        const file1 = path.join(cacheTestDir, 'moduleA.ts');
        fs.writeFileSync(file1, `
            export const moduleA = {
                get_test: () => true
            };
        `);

        // First call - cold
        const firstManifest = projectService.generateManifest(cacheTestDir);
        assert.ok(firstManifest.moduleA);

        // Second call - should return cached instance immediately
        const secondManifest = projectService.generateManifest(cacheTestDir);
        assert.strictEqual(firstManifest, secondManifest, 'Should return the identical cached reference');

        // Modify file on disk with updated mtime
        await new Promise(r => setTimeout(r, 50));
        fs.appendFileSync(file1, `\n// modified\n`);
        const now = new Date();
        fs.utimesSync(file1, now, now);

        // Cache should automatically detect modification and return new manifest
        const thirdManifest = projectService.generateManifest(cacheTestDir);
        assert.notStrictEqual(secondManifest, thirdManifest, 'Should recompute when file mtime changes');

        // Manual invalidation test
        projectService.invalidateManifestCache();
        const fourthManifest = projectService.generateManifest(cacheTestDir);
        assert.notStrictEqual(thirdManifest, fourthManifest, 'Should recompute after invalidateManifestCache');
    });
});
