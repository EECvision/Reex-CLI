const fs = require('fs');
const path = require('path');

/**
 * Generates TS Interface content from argument metadata
 */
function toInterfaceContent(name, args) {
    const isEmpty = !args?.length ||
        (args.length === 1 && args[0].isObject && (!args[0].properties || args[0].properties.length === 0));

    if (isEmpty) {
        return `export type ${name} = unknown;\n`;
    }

    const lines = [`export interface ${name} {`];
    const indent = "  ";

    if (args.length === 1 && args[0].isObject && Array.isArray(args[0].properties)) {
        // Single object argument (destructured params pattern)
        for (const prop of args[0].properties) {
            lines.push(`${indent}${prop.name}${prop.isOptional ? "?" : ""}: ${prop.type};`);
        }
    } else {
        // Multiple arguments (standard params pattern)
        for (const arg of args) {
            lines.push(`${indent}${arg.name}${arg.isOptional ? "?" : ""}: ${arg.type ?? "any"};`);
        }
    }

    lines.push("}");
    return lines.join("\n") + "\n";
}

/**
 * Generates Types folder structure based on Manifest
 * @param {string} targetDir 
 * @param {object} manifest 
 */
function generateTypes(targetDir, manifest) {
    const typesDir = path.join(targetDir, 'src', 'api-services', 'types');

    // Ensure types root exists
    if (!fs.existsSync(typesDir)) {
        fs.mkdirSync(typesDir, { recursive: true });
    }

    const expectedFiles = new Set();
    const modules = Object.keys(manifest);

    console.log(`[TYPES] Generating for ${modules.length} modules...`);

    modules.forEach(moduleName => {
        const moduleMethods = manifest[moduleName];
        const moduleTypeDir = path.join(typesDir, moduleName);

        if (!fs.existsSync(moduleTypeDir)) {
            fs.mkdirSync(moduleTypeDir, { recursive: true });
        }

        Object.keys(moduleMethods).forEach(methodName => {
            if (methodName.startsWith('delete_')) return;

            const methodData = moduleMethods[methodName];
            const typeFileName = `${methodName}.ts`;
            const typeFilePath = path.join(moduleTypeDir, typeFileName);

            expectedFiles.add(typeFilePath);

            // Check for manual overrides
            const typeFileExists = fs.existsSync(typeFilePath);
            const hasManualFlag = typeFileExists && fs.readFileSync(typeFilePath, 'utf8').includes('/* sync-type-disable */');

            if (hasManualFlag) {
                console.log(`[TYPES] Skipped (manual): ${moduleName}/${typeFileName}`);
                return;
            }

            // Special handling for get (often empty)
            if (methodName.startsWith('get_')) {
                if (typeFileExists) {
                    const content = fs.readFileSync(typeFilePath, 'utf8').trim();
                    const defaultContent = `export type ${methodName} = unknown;`.trim();
                    if (content !== "" && content !== defaultContent) {
                        // Keep existing custom type if it differs from default
                        return; // Treat as manually modified
                    }
                }
            }

            let content = toInterfaceContent(methodName, methodData.args);

            // Optimization: Read before write to stop watcher loops
            if (fs.existsSync(typeFilePath)) {
                const current = fs.readFileSync(typeFilePath, 'utf8');
                if (current === content) return;
            }

            fs.writeFileSync(typeFilePath, content, 'utf8');
        });
    });

    // Cleanup logic
    const walkAndClean = (dir) => {
        if (!fs.existsSync(dir)) return;

        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                walkAndClean(fullPath);
                try {
                    const remaining = fs.readdirSync(fullPath);
                    if (remaining.length === 0) {
                        fs.rmdirSync(fullPath); // Delete empty folder
                    }
                } catch (e) { }
            } else if (fullPath.endsWith('.ts') && !expectedFiles.has(fullPath)) {
                // Only delete .ts files that are not expected. 
                // We should preserve .mock.json or other files if they were manually added?
                // The original script deleted them.
                fs.unlinkSync(fullPath);
                // console.log(`[TYPES] Deleted obsolete: ${fullPath}`);
            }
        }
    };

    walkAndClean(typesDir);
    console.log("[TYPES] Generation Complete");
}

module.exports = { generateTypes };
