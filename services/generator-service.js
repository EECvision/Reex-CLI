const fs = require('fs');
const path = require('path');
const { API_SERVICES_RELATIVE_DIR } = require('../paths');
const projectService = require('./project-service');
const typeService = require('./type-service');
const hookService = require('./hook-service');

const sseService = require('./sse-service');

const CORE_HOOKS = [
  'useAuthState.ts',
  'useNotification.ts',
  'useClearSession.ts',
  'useTokens.ts',
  'useHeaders.ts'
];

class GeneratorService {

  sanitizeDirectory(targetDir, templateDirs, recoveredDir, basePath = '') {
    if (!fs.existsSync(targetDir)) return;
    
    // Build set of allowed files for the current basePath
    const allowedFiles = new Set();
    templateDirs.forEach(dir => {
      const currentTemplateDir = path.join(dir, basePath);
      if (fs.existsSync(currentTemplateDir)) {
        fs.readdirSync(currentTemplateDir).forEach(file => allowedFiles.add(file));
      }
    });

    // Scan targetDir for foreign files/folders
    const currentTargetDir = path.join(targetDir, basePath);
    if (!fs.existsSync(currentTargetDir)) return;

    fs.readdirSync(currentTargetDir).forEach(file => {
      const fullPath = path.join(currentTargetDir, file);
      const isAllowed = allowedFiles.has(file);
      
      if (!isAllowed) {
        const relativeToRoot = path.join(path.basename(targetDir), basePath, file);
        const recoverPath = path.join(recoveredDir, relativeToRoot);
        
        if (!fs.existsSync(path.dirname(recoverPath))) {
          fs.mkdirSync(path.dirname(recoverPath), { recursive: true });
        }
        
        try {
          fs.renameSync(fullPath, recoverPath);
          const rootCategory = path.basename(targetDir);
          const displayPath = path.join(basePath, file).replace(/\\/g, '/');
          console.warn(`\x1b[33m[WARNING] Unauthorized file/folder detected in ${rootCategory}: ${displayPath}. Moved to _recovered folder.\x1b[0m`);
        } catch (e) {
          console.error(`[Generator] Failed to quarantine ${file}:`, e.message);
        }
      } else {
        if (fs.statSync(fullPath).isDirectory()) {
          this.sanitizeDirectory(targetDir, templateDirs, recoveredDir, path.join(basePath, file));
        }
      }
    });
  }


  copyRecursiveSync(src, dest, overwrite = false) {
    if (fs.existsSync(src)) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      fs.readdirSync(src).forEach((childItemName) => {
        const srcPath = path.join(src, childItemName);
        const destPath = path.join(dest, childItemName);
        const stats = fs.statSync(srcPath);
        if (stats.isDirectory()) {
          this.copyRecursiveSync(srcPath, destPath, overwrite);
        } else {
          if (overwrite || !fs.existsSync(destPath)) {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      });
    }
  }

  detectFramework(apiTargetDir) {
    const packageJsonPath = path.join(apiTargetDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error("Could not find package.json in the target directory.");
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};
    const allDeps = { ...dependencies, ...devDependencies };

    if (allDeps['next']) {
      return 'nextjs';
    } else if (allDeps['react'] || allDeps['react-dom']) {
      return 'react';
    } else {
      throw new Error("Unsupported project. Reex API Builder currently supports React and Next.js projects only.");
    }
  }

  /**
   * Regenerates the API project structure:
   * 1. Scaffolds api-client files (core, index)
   * 2. Generates Manifest from definitions
   * 3. Generates Hooks
   * 4. Generates Types
   * 5. Prunes unused clients
   * 6. Generates index barrel
   * 7. Copies Providers (from templates)
   * @param {string} apiTargetDir 
   */
  async regenerate(apiTargetDir, changedModules = null) {
    const definitionsDir = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR, 'definitions');

    // api-client files
    const clientBuilderPath = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR, 'core.ts');

    // config files
    const apiConfigPath = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR, 'api.config.ts');

    const providersDir = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR, 'providers');

    try {
      console.log("[Generator] Regenerating Manifest & Hooks...");

      if (!fs.existsSync(path.dirname(apiConfigPath))) {
        fs.mkdirSync(path.dirname(apiConfigPath), { recursive: true });
      }

      // Framework Detection
      const framework = this.detectFramework(apiTargetDir);
      console.log(`[Generator] Detected framework: ${framework}`);

      const sharedTemplateDir = path.join(__dirname, '../templates-shared');
      const templateBaseDir = framework === 'nextjs'
        ? path.join(__dirname, '../templates-next')
        : path.join(__dirname, '../templates-react');

      // Helper function to resolve paths
      const resolveTemplateFile = (relativePath) => {
        const fwPath = path.join(templateBaseDir, relativePath);
        if (fs.existsSync(fwPath)) return fwPath;
        const sharedPath = path.join(sharedTemplateDir, relativePath);
        if (fs.existsSync(sharedPath)) return sharedPath;
        return null;
      };

      // 1. api.config.ts - User Config
      if (!fs.existsSync(apiConfigPath)) {
        const templateApiConfigPath = resolveTemplateFile('api.config.ts');
        if (templateApiConfigPath) {
          fs.copyFileSync(templateApiConfigPath, apiConfigPath);
          console.log("[Generator] Scaffolded api.config.ts from template");
        }
      }



      // 3. core.ts - Scaffold Once
      const templateClientBuilderPath = resolveTemplateFile('core.ts');
      if (templateClientBuilderPath && !fs.existsSync(clientBuilderPath)) {
        fs.copyFileSync(templateClientBuilderPath, clientBuilderPath);
        console.log("[Generator] Scaffolded core.ts from template");
      }

      // 4. Custom folder - Copy from templates (no overwrite)
      const customDir = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR, 'custom');
      if (!fs.existsSync(customDir)) {
        fs.mkdirSync(customDir, { recursive: true });
      }
      
      const sharedCustomDir = path.join(sharedTemplateDir, 'custom');
      const templateCustomDir = path.join(templateBaseDir, 'custom');
      
      if (fs.existsSync(sharedCustomDir)) this.copyRecursiveSync(sharedCustomDir, customDir, false);
      if (fs.existsSync(templateCustomDir)) this.copyRecursiveSync(templateCustomDir, customDir, false);
      console.log("[Generator] Scaffolded custom directory");
      // 2. Generate Manifest
      // Prune definition files first (remove unused interfaces/imports)
      await projectService.pruneUnusedDefinitions(definitionsDir);

      const manifest = projectService.generateManifest(definitionsDir);

      // 3. Generate Hooks
      hookService.generateHooks(apiTargetDir, manifest, changedModules);

      // 3b. Generate Types Folder
      typeService.generateTypes(apiTargetDir, manifest, changedModules);

      // 3c. Sync Clients (Auto-Prune unused clients) - REMOVED (Replaced by static api-client/index.ts)

      // 4. Regenerate Barrel File (API_SERVICES_RELATIVE_DIR/definitions/index.ts)
      const moduleNames = Object.keys(manifest).sort();
      const barrelContent = `import { type ReexDefinition } from "../core";
${moduleNames.map((name) => `import { ${name}Api } from "./${name}";`).join('\n')}

export const api = {
${moduleNames.map((name) => `  ...${name}Api,`).join('\n')}
} satisfies ReexDefinition;
`;
      if (!fs.existsSync(definitionsDir)) {
        fs.mkdirSync(definitionsDir, { recursive: true });
      }
      const barrelPath = path.join(definitionsDir, 'index.ts');
      fs.writeFileSync(barrelPath, barrelContent);
      console.log(`[Generator] Regenerated ${API_SERVICES_RELATIVE_DIR}/definitions/index.ts`);

      // 7. Providers (Copy from templates)
      if (!fs.existsSync(providersDir)) {
        fs.mkdirSync(providersDir, { recursive: true });
      }

      const recoveredDir = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR, '_recovered');
      const sharedProvidersDir = path.join(sharedTemplateDir, 'providers');
      const templateProvidersDir = path.join(templateBaseDir, 'providers');
      
      if (!fs.existsSync(sharedProvidersDir) && !fs.existsSync(templateProvidersDir)) {
        console.warn(`[Generator] Warning: templates/providers directory not found in shared or ${framework}`);
      } else {
        this.sanitizeDirectory(providersDir, [sharedProvidersDir, templateProvidersDir], recoveredDir);
        if (fs.existsSync(sharedProvidersDir)) this.copyRecursiveSync(sharedProvidersDir, providersDir, false);
        if (fs.existsSync(templateProvidersDir)) this.copyRecursiveSync(templateProvidersDir, providersDir, false);
        console.log("[Generator] Scaffolded providers from templates (if missing)");
      }

      // 7b. Hooks (Copy from templates)
      const hooksDir = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR, 'hooks');
      if (!fs.existsSync(hooksDir)) {
        fs.mkdirSync(hooksDir, { recursive: true });
      }

      const sharedHooksDir = path.join(sharedTemplateDir, 'hooks');
      const templateHooksDir = path.join(templateBaseDir, 'hooks');
      
      if (!fs.existsSync(sharedHooksDir) && !fs.existsSync(templateHooksDir)) {
        console.warn(`[Generator] Warning: templates/hooks directory not found in shared or ${framework}`);
      } else {
        this.sanitizeDirectory(hooksDir, [sharedHooksDir, templateHooksDir], recoveredDir);
        const essentialHooks = CORE_HOOKS;
        essentialHooks.forEach(hookFile => {
          const targetPath = path.join(hooksDir, hookFile);
          if (!fs.existsSync(targetPath)) {
            const sharedPath = path.join(sharedHooksDir, hookFile);
            const templatePath = path.join(templateHooksDir, hookFile);
            if (fs.existsSync(sharedPath)) {
              fs.copyFileSync(sharedPath, targetPath);
            } else if (fs.existsSync(templatePath)) {
              fs.copyFileSync(templatePath, targetPath);
            }
          }
        });
        console.log("[Generator] Scaffolded essential hooks from templates");
      }

      // 7c. Auth (Copy from templates)
      const authDir = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR, 'auth-methods');
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
      }

      const sharedAuthDir = path.join(sharedTemplateDir, 'auth-methods');
      const templateAuthDir = path.join(templateBaseDir, 'auth-methods');
      
      if (!fs.existsSync(sharedAuthDir) && !fs.existsSync(templateAuthDir)) {
        console.warn(`[Generator] Warning: templates/auth-methods directory not found in shared or ${framework}`);
      } else {
        this.sanitizeDirectory(authDir, [sharedAuthDir, templateAuthDir], recoveredDir);
        if (fs.existsSync(sharedAuthDir)) this.copyRecursiveSync(sharedAuthDir, authDir, false);
        if (fs.existsSync(templateAuthDir)) this.copyRecursiveSync(templateAuthDir, authDir, false);
        console.log("[Generator] Scaffolded auth-methods from templates (if missing)");
      }

      // 8. Install Dependencies (axios, @tanstack/react-query)
      const packageJsonPath = path.join(apiTargetDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const dependencies = packageJson.dependencies || {};
        const devDependencies = packageJson.devDependencies || {};
        const allDeps = { ...dependencies, ...devDependencies };

        const packagesToInstall = [];
        if (!allDeps['axios']) packagesToInstall.push('axios');
        if (!allDeps['@tanstack/react-query']) packagesToInstall.push('@tanstack/react-query');

        // Framework specific dependencies
        if (framework === 'nextjs') {
          if (!allDeps['cookies-next']) packagesToInstall.push('cookies-next');
          if (!allDeps['next-auth']) packagesToInstall.push('next-auth');
        }

        if (packagesToInstall.length > 0) {
          console.log(`[Generator] Missing dependencies: ${packagesToInstall.join(', ')}. Installing...`);
          try {
            require('child_process').execSync(`npm install ${packagesToInstall.join(' ')}`, { cwd: apiTargetDir, stdio: 'inherit' });
            console.log("[Generator] Dependencies installed successfully.");
          } catch (err) {
            console.error("[Generator] Failed to install dependencies:", err);
          }
        }
      }



      // 9. Run Prettier globally across all generated files
      try {
          console.log("[Generator] Starting Prettier formatting pass...");
          const { execSync } = require('child_process');
          
          // Try to use the developer's local prettier first to ensure 100% format matching
          let prettierPath;
          const devPrettierV3 = path.join(apiTargetDir, 'node_modules', 'prettier', 'bin', 'prettier.cjs');
          const devPrettierV2 = path.join(apiTargetDir, 'node_modules', 'prettier', 'bin-prettier.js');
          
          // Check if project has Prettier configured or installed
          const packageJsonPath = path.join(apiTargetDir, 'package.json');
          let usesPrettier = false;
          if (fs.existsSync(packageJsonPath)) {
              try {
                  const pkg = require(packageJsonPath);
                  usesPrettier = !!(
                      (pkg.dependencies && pkg.dependencies.prettier) ||
                      (pkg.devDependencies && pkg.devDependencies.prettier) ||
                      pkg.prettier
                  );
              } catch(e) {}
          }
          
          if (!usesPrettier) {
              const prettierConfigs = ['.prettierrc', '.prettierrc.json', '.prettierrc.js', 'prettier.config.js', '.prettierrc.yaml', '.prettierrc.yml'];
              usesPrettier = prettierConfigs.some(cfg => fs.existsSync(path.join(apiTargetDir, cfg)));
          }
          
          if (fs.existsSync(devPrettierV3)) {
              prettierPath = devPrettierV3;
          } else if (fs.existsSync(devPrettierV2)) {
              prettierPath = devPrettierV2;
          } else if (usesPrettier) {
              // Fallback to the bridge's prettier if the project uses it but hasn't installed node_modules yet
              prettierPath = path.join(path.dirname(require.resolve('prettier/package.json')), 'bin/prettier.cjs');
          }
          
          if (!prettierPath) {
              console.log("[Generator] No local Prettier configured in project. Skipping formatting pass to preserve existing styles.");
          } else {
              let targetGlobs = `"${path.posix.join(API_SERVICES_RELATIVE_DIR, '**/*.{ts,tsx}')}"`;
              if (changedModules && changedModules.length > 0) {
                  const globs = [];
                  for (const mod of changedModules) {
                      const pascal = mod.charAt(0).toUpperCase() + mod.slice(1);
                      globs.push(`"${API_SERVICES_RELATIVE_DIR}/definitions/${mod}.ts"`);
                      globs.push(`"${API_SERVICES_RELATIVE_DIR}/generated/use${pascal}Queries.ts"`);
                      globs.push(`"${API_SERVICES_RELATIVE_DIR}/types/${mod}/**/*.ts"`);
                  }
                  globs.push(`"${API_SERVICES_RELATIVE_DIR}/generated/index.ts"`);
                  globs.push(`"${API_SERVICES_RELATIVE_DIR}/definitions/index.ts"`);
                  targetGlobs = globs.join(' ');
              }
              
              execSync(`node "${prettierPath}" --write ${targetGlobs}`, { cwd: apiTargetDir, stdio: 'inherit' });
              console.log("[Generator] Prettier formatting pass complete using:", prettierPath);
          }
      } catch (err) {
          console.error("[Generator] Failed to run Prettier globally:", err.message);
      }

      // Sanitize root of api-services to protect directory structure
      const apiServicesRoot = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR);
      if (fs.existsSync(apiServicesRoot)) {
        const allowedRootEntities = new Set([
          'definitions', 'generated', 'types', 'providers', 'hooks', 'auth-methods', 'custom', '_recovered', 'core.ts', 'api.config.ts', 'index.ts', '.reex'
        ]);
        fs.readdirSync(apiServicesRoot).forEach(entry => {
          if (!allowedRootEntities.has(entry)) {
            const fullPath = path.join(apiServicesRoot, entry);
            const recoverPath = path.join(recoveredDir, 'root', entry);
            if (!fs.existsSync(path.dirname(recoverPath))) {
              fs.mkdirSync(path.dirname(recoverPath), { recursive: true });
            }
            try {
              fs.renameSync(fullPath, recoverPath);
              console.warn(`\x1b[33m[WARNING] Unauthorized file/folder detected in api-services root: ${entry}. Moved to _recovered/root.\x1b[0m`);
            } catch(e) {
              console.error(`[Generator] Failed to quarantine root entity ${entry}:`, e.message);
            }
          }
        });
      }

      sseService.broadcast(Date.now().toString(), 'project:updated', 'Project generated');
      console.log("[Generator] Regeneration Complete");
      return { success: true, manifestKeys: moduleNames };
    } catch (e) {
      console.error("[Generator] Regeneration Failed:", e);
      throw e;
    }
  }
  resetScaffold(apiTargetDir, target) {
    const framework = this.detectFramework(apiTargetDir);
    const sharedTemplateDir = path.join(__dirname, '../templates-shared');
    const templateBaseDir = framework === 'nextjs'
      ? path.join(__dirname, '../templates-next')
      : path.join(__dirname, '../templates-react');

    const apiServicesDir = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR);
    if (!fs.existsSync(apiServicesDir)) {
      fs.mkdirSync(apiServicesDir, { recursive: true });
    }

    if (!target) {
      const resolveTemplateFile = (relativePath) => {
        const fwPath = path.join(templateBaseDir, relativePath);
        if (fs.existsSync(fwPath)) return fwPath;
        const sharedPath = path.join(sharedTemplateDir, relativePath);
        if (fs.existsSync(sharedPath)) return sharedPath;
        return null;
      };

      const resetFile = (filename) => {
        const tpl = resolveTemplateFile(filename);
        if (tpl) {
          fs.copyFileSync(tpl, path.join(apiServicesDir, filename));
          console.log(`[Reset] Reset ${filename}`);
        }
      }

      resetFile('api.config.ts');
      resetFile('core.ts');
      
      const generatedDir = path.join(apiServicesDir, 'generated');
      const queryConfigPath = path.join(generatedDir, 'query.config.ts');
      if (fs.existsSync(queryConfigPath)) {
        fs.unlinkSync(queryConfigPath);
      }
      fs.mkdirSync(generatedDir, { recursive: true });
      hookService.generateBaseHooksFile(generatedDir);
      console.log(`[Reset] Reset generated/query.config.ts`);

      const copyFolder = (folderName) => {
        const destDir = path.join(apiServicesDir, folderName);

        if (folderName === 'hooks') {
          const hooksToReset = new Set(CORE_HOOKS);
          if (fs.existsSync(destDir)) {
            fs.readdirSync(destDir).forEach(file => {
              if (file.endsWith('.ts')) {
                hooksToReset.add(file);
              }
            });
          } else {
            fs.mkdirSync(destDir, { recursive: true });
          }
          
          hooksToReset.forEach(hookFile => {
            const destPath = path.join(destDir, hookFile);
            const sharedPath = path.join(sharedTemplateDir, 'hooks', hookFile);
            const templatePath = path.join(templateBaseDir, 'hooks', hookFile);
            if (fs.existsSync(sharedPath)) {
              fs.copyFileSync(sharedPath, destPath);
            } else if (fs.existsSync(templatePath)) {
              fs.copyFileSync(templatePath, destPath);
            }
          });
          console.log(`[Reset] Reset hooks (only installed and core hooks)`);
          return;
        }
        
        const sharedDir = path.join(sharedTemplateDir, folderName);
        if (fs.existsSync(sharedDir)) {
          this.copyRecursiveSync(sharedDir, destDir, true);
        }

        const templateDir = path.join(templateBaseDir, folderName);
        if (fs.existsSync(templateDir)) {
          this.copyRecursiveSync(templateDir, destDir, true);
        }
        console.log(`[Reset] Reset ${folderName}`);
      };

      copyFolder('providers');
      copyFolder('hooks');
      copyFolder('auth-methods');
      return;
    }

    // Normalizing target (e.g. src\api-services\hooks\useAuthState.ts -> hooks/useAuthState.ts)
    let normalizedTarget = target.replace(/\\/g, '/');
    normalizedTarget = normalizedTarget.replace(/^(src\/)?api-services\//, '');

    if (normalizedTarget === 'query.config.ts' || normalizedTarget === 'generated/query.config.ts' || normalizedTarget === 'query.config' || normalizedTarget === 'generated/query.config') {
      const generatedDir = path.join(apiServicesDir, 'generated');
      const queryConfigPath = path.join(generatedDir, 'query.config.ts');
      if (fs.existsSync(queryConfigPath)) {
        fs.unlinkSync(queryConfigPath);
      }
      fs.mkdirSync(generatedDir, { recursive: true });
      hookService.generateBaseHooksFile(generatedDir);
      console.log(`[Reset] Reset file: generated/query.config.ts`);
      return;
    }

    const findInTemplates = (query, dirs) => {
      let matches = [];
      const search = (dir, currentPath = '') => {
        if (!fs.existsSync(dir)) return;
        fs.readdirSync(dir).forEach(file => {
          const fullPath = path.join(dir, file);
          const relativePath = path.join(currentPath, file).replace(/\\/g, '/');
          const withoutExt = (str) => str.replace(/\.[^/.]+$/, "");
          if (relativePath === query || withoutExt(relativePath) === query || 
              relativePath.endsWith('/' + query) || withoutExt(relativePath).endsWith('/' + query) || 
              file === query || withoutExt(file) === query) {
            matches.push({
               sourcePath: fullPath,
               relativePath: relativePath,
               isDirectory: fs.statSync(fullPath).isDirectory()
            });
          } else if (fs.statSync(fullPath).isDirectory()) {
            search(fullPath, relativePath);
          }
        });
      };

      dirs.forEach(d => search(d));
      
      const uniqueMatches = {};
      matches.forEach(m => {
          uniqueMatches[m.relativePath] = m;
      });
      return Object.values(uniqueMatches);
    };

    const matches = findInTemplates(normalizedTarget, [sharedTemplateDir, templateBaseDir]);

    if (matches.length === 0) {
       throw new Error(`Target "${target}" not found in any scaffold templates.`);
    }

    if (matches.length > 1) {
       const paths = matches.map(m => m.relativePath).join(', ');
       throw new Error(`Target "${target}" is ambiguous. Found multiple matches: ${paths}. Please provide a more specific path (e.g. "hooks/useAuthState.ts").`);
    }

    const match = matches[0];
    const destPath = path.join(apiServicesDir, match.relativePath);
    
    if (match.isDirectory) {
        if (match.relativePath === 'hooks') {
            const hooksToReset = new Set(CORE_HOOKS);
            if (fs.existsSync(destPath)) {
                fs.readdirSync(destPath).forEach(file => {
                    if (file.endsWith('.ts')) {
                        hooksToReset.add(file);
                    }
                });
            } else {
                fs.mkdirSync(destPath, { recursive: true });
            }
            
            hooksToReset.forEach(hookFile => {
                const targetFilePath = path.join(destPath, hookFile);
                const sharedPath = path.join(sharedTemplateDir, 'hooks', hookFile);
                const templatePath = path.join(templateBaseDir, 'hooks', hookFile);
                if (fs.existsSync(sharedPath)) {
                    fs.copyFileSync(sharedPath, targetFilePath);
                } else if (fs.existsSync(templatePath)) {
                    fs.copyFileSync(templatePath, targetFilePath);
                }
            });
            console.log(`[Reset] Reset folder: hooks (only installed and core hooks)`);
        } else {
            this.copyRecursiveSync(match.sourcePath, destPath, true);
            console.log(`[Reset] Reset folder: ${match.relativePath}`);
        }
    } else {
        if (!fs.existsSync(path.dirname(destPath))) {
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
        }
        fs.copyFileSync(match.sourcePath, destPath);
        console.log(`[Reset] Reset file: ${match.relativePath}`);
    }
  }
}

module.exports = new GeneratorService();
