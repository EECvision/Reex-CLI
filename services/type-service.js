const fs = require('fs');
const path = require('path');

/**
 * Generates TS Interface content from argument metadata
 */

/**
 * Generates Types folder structure based on Manifest
 * @param {string} targetDir 
 * @param {object} manifest 
 */
function generateTypes(targetDir, manifest, changedModules = null) {
  const { API_SERVICES_RELATIVE_DIR } = require('../paths');
  const typesDir = path.join(targetDir, API_SERVICES_RELATIVE_DIR, 'types');

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

      // Start with forceful default
      const defaultContent = `export type ${methodName} = unknown;\n`;
      let content = defaultContent;

      // Optimization: Read before write to stop watcher loops
      // AND check if we should overwrite (e.g. if it's an interface but we want unknown)
      if (typeFileExists) {
        const current = fs.readFileSync(typeFilePath, 'utf8');

        // 1. If content matches default (unknown), no need to write (Optimization)
        if (current.trim() === content.trim()) return;

        // 2. Logic Change: If it DOESN'T match default, it means the user (or legacy code) 
        // changed it to something else (e.g. defined a Type). 
        // We MUST preserve that change.
        if (current.trim().length > 0) {
          // console.log(`[TYPES] Skipped (user modified): ${moduleName}/${typeFileName}`);
          return;
        }
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
        const recoveredDir = path.join(targetDir, API_SERVICES_RELATIVE_DIR, '_recovered', 'types');
        const relativePath = path.relative(typesDir, fullPath);
        const recoverPath = path.join(recoveredDir, relativePath);

        if (!fs.existsSync(path.dirname(recoverPath))) {
          fs.mkdirSync(path.dirname(recoverPath), { recursive: true });
        }

        try {
          fs.renameSync(fullPath, recoverPath);
          console.warn(`\x1b[33m[WARNING] Unauthorized/obsolete file detected in types: ${relativePath.replace(/\\/g, '/')}. Moved to _recovered folder.\x1b[0m`);
        } catch (e) {
          console.error(`[Generator] Failed to quarantine types file ${entry}:`, e.message);
        }
      }
    }
  };

  walkAndClean(typesDir);
  console.log("[TYPES] Generation Complete");
}

module.exports = { generateTypes };
