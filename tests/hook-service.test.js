const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const hookService = require('../services/hook-service');

test('Hook Service Tests', async (t) => {
    // Setup Temp Dir
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-'));
    // Hook Service expects {targetDir}/src/api-services/definitions | generated
    const definitionsDir = path.join(tmpDir, 'api-services', 'definitions');
    const generatedDir = path.join(tmpDir, 'api-services', 'generated');

    fs.mkdirSync(definitionsDir, { recursive: true });

    // Cleanup Helper
    t.after(() => {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (e) {
            console.warn("Cleanup failed", e);
        }
    });

    await t.test('generateHooks creates files correctly', () => {
        const manifest = {
            'products': {
                'get_all': { args: [] },
                'post_create': { args: [{ name: 'item', type: '{ name: string }' }] }
            }
        };

        hookService.generateHooks(tmpDir, manifest);

        // Check Directory Matches
        assert.ok(fs.existsSync(generatedDir), 'Generated dir should exist');

        // Check Index
        const indexContent = fs.readFileSync(path.join(generatedDir, 'index.ts'), 'utf8');
        assert.ok(indexContent.includes('export * from "./useProductsQueries";'), 'Index should export products');

        // Check Module File
        const productsFile = path.join(generatedDir, 'useProductsQueries.ts');
        assert.ok(fs.existsSync(productsFile), 'Module file should exist');

        const content = fs.readFileSync(productsFile, 'utf8');
        // useGetAllQuery because method is get_all
        assert.ok(content.includes('export const useGetAllQuery'), 'Should generate Query hook (useGetAllQuery)');
        // usePostCreateMutation because method is post_create
        assert.ok(content.includes('export const usePostCreateMutation'), 'Should generate Mutation hook (usePostCreateMutation)');

        assert.ok(content.includes('useApiQuery'), 'Should import usageApiQuery');
        assert.ok(content.includes('useApiMutation'), 'Should import usageApiMutation');
    });

    await t.test('generateHooks handles collisions via aliasing', () => {
        const manifest = {
            'moduleA': { 'get_test': { args: [] } },  // useGetTestQuery
            'moduleB': { 'get_test': { args: [] } }   // useGetTestQuery -> Collision!
        };

        hookService.generateHooks(tmpDir, manifest);

        // Check Modules generated
        assert.ok(fs.existsSync(path.join(generatedDir, 'useModuleAQueries.ts')));
        assert.ok(fs.existsSync(path.join(generatedDir, 'useModuleBQueries.ts')));

        // Check Index for Aliasing
        const indexContent = fs.readFileSync(path.join(generatedDir, 'index.ts'), 'utf8');

        // Expected Alias: useGetTestQuery as useModuleAGetTestQuery
        assert.ok(indexContent.includes('useGetTestQuery as useModuleAGetTestQuery'), 'ModuleA should be aliased');
        assert.ok(indexContent.includes('useGetTestQuery as useModuleBGetTestQuery'), 'ModuleB should be aliased');
    });
});
