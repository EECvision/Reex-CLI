const fs = require('fs');
const path = require('path');
const projectService = require('./project-service');
const typeService = require('./type-service');
const hookService = require('./hook-service');
const configService = require('./config-service');
const sseService = require('./sse-service');

class GeneratorService {

  copyRecursiveSync(src, dest) {
    if (fs.existsSync(src)) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      fs.readdirSync(src).forEach((childItemName) => {
        const srcPath = path.join(src, childItemName);
        const destPath = path.join(dest, childItemName);
        const stats = fs.statSync(srcPath);
        if (stats.isDirectory()) {
          this.copyRecursiveSync(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      });
    }
  }

  /**
   * Regenerates the API project structure:
   * 1. Scaffolds config files (constants, core, utils)
   * 2. Generates Manifest from definitions
   * 3. Generates Hooks
   * 4. Generates Types
   * 5. Prunes unused clients
   * 6. Generates index barrel
   * 7. Copies Providers (from templates)
   * @param {string} apiTargetDir 
   */
  regenerate(apiTargetDir) {
    const definitionsDir = path.join(apiTargetDir, 'src', 'api-services', 'definitions');
    const configDir = path.join(apiTargetDir, 'src', 'api-services', 'config');
    const userConfigDir = path.join(apiTargetDir, 'src', 'api-services', 'user-config');
    
    // config files
    const indexTimePath = path.join(configDir, 'index.ts');
    const clientBuilderPath = path.join(configDir, 'clientBuilder.ts');
    
    // user-config files
    const constantsPath = path.join(userConfigDir, 'constants.ts');
    const authPath = path.join(userConfigDir, 'auth.ts');
    
    const providersDir = path.join(apiTargetDir, 'src', 'api-services', 'providers');

    try {
      console.log("[Generator] Regenerating Manifest & Hooks...");

      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      if (!fs.existsSync(userConfigDir)) {
        fs.mkdirSync(userConfigDir, { recursive: true });
      }

      // 1. user-config/constants.ts - User Config (Base URL)
      if (!fs.existsSync(constantsPath)) {
        const templateConstantsPath = path.join(__dirname, '../templates/user-config/constants.ts');
        if (fs.existsSync(templateConstantsPath)) {
          fs.copyFileSync(templateConstantsPath, constantsPath);
          console.log("[Generator] Scaffoled user-config/constants.ts from template");
        }
      }

      // 2. user-config/auth.ts - User Config (Auth endpoints, custom URLs)
      if (!fs.existsSync(authPath)) {
        const templateAuthPath = path.join(__dirname, '../templates/user-config/auth.ts');
        if (fs.existsSync(templateAuthPath)) {
          fs.copyFileSync(templateAuthPath, authPath);
          console.log("[Generator] Scaffoled user-config/auth.ts from template");
        }
      }

      // 3. config/clientBuilder.ts - Managed by Bridge (Internal)
      const templateClientBuilderPath = path.join(__dirname, '../templates/config/clientBuilder.ts');
      if (fs.existsSync(templateClientBuilderPath)) {
        // ALWAYS updated by bridge
        fs.copyFileSync(templateClientBuilderPath, clientBuilderPath);
        console.log("[Generator] Updated config/clientBuilder.ts from template");
      }

      // 4. config/index.ts - BARREL ONLY (Managed by Bridge)
      const templateIndexPath = path.join(__dirname, '../templates/config/index.ts');
      if (fs.existsSync(templateIndexPath)) {
        fs.copyFileSync(templateIndexPath, indexTimePath);
        console.log("[Generator] Updated config/index.ts from template");
      }


      // 2. Generate Manifest
      // Prune definition files first (remove unused interfaces/imports)
      projectService.pruneUnusedDefinitions(definitionsDir);

      const manifest = projectService.generateManifest(definitionsDir);

      // 3. Generate Hooks
      hookService.generateHooks(apiTargetDir, manifest);

      // 3b. Generate Types Folder
      typeService.generateTypes(apiTargetDir, manifest);

      // 3c. Sync Clients (Auto-Prune unused clients) - REMOVED (Replaced by static config/index.ts)

      // 4. Regenerate Barrel File (src/api-services/index.ts)
      const moduleNames = Object.keys(manifest).sort();
      const barrelContent = `export * from "./config";
export * from "./user-config/constants";
export * from "./user-config/auth";

${moduleNames.map((name) => `import { ${name}Api } from "./definitions/${name}";`).join('\n')}

export const api = {
${moduleNames.map((name) => `  ...${name}Api,`).join('\n')}
};
`;
      const barrelPath = path.join(apiTargetDir, 'src', 'api-services', 'index.ts');
      fs.writeFileSync(barrelPath, barrelContent);
      console.log("[Generator] Regenerated src/api-services/index.ts");

      // 7. Providers (Copy from templates)
      if (!fs.existsSync(providersDir)) {
        fs.mkdirSync(providersDir, { recursive: true });
      }

      const templateProvidersDir = path.join(__dirname, '../templates/providers');
      if (fs.existsSync(templateProvidersDir)) {
        this.copyRecursiveSync(templateProvidersDir, providersDir);
        console.log("[Generator] Copied providers from templates");
      } else {
        console.warn("[Generator] Warning: templates/providers directory not found");
      }

      // 7b. Hooks (Copy from templates)
      const hooksDir = path.join(apiTargetDir, 'src', 'api-services', 'hooks');
      if (!fs.existsSync(hooksDir)) {
        fs.mkdirSync(hooksDir, { recursive: true });
      }

      const templateHooksDir = path.join(__dirname, '../templates/hooks');
      if (fs.existsSync(templateHooksDir)) {
        this.copyRecursiveSync(templateHooksDir, hooksDir);
        console.log("[Generator] Copied hooks from templates");
      } else {
        console.warn("[Generator] Warning: templates/hooks directory not found");
      }

      // 7c. Auth (Copy from templates)
      const authDir = path.join(apiTargetDir, 'src', 'api-services', 'auth');
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
      }

      const templateAuthDir = path.join(__dirname, '../templates/auth');
      if (fs.existsSync(templateAuthDir)) {
        this.copyRecursiveSync(templateAuthDir, authDir);
        console.log("[Generator] Copied auth from templates");
      } else {
        console.warn("[Generator] Warning: templates/auth directory not found");
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
        if (!allDeps['cookies-next']) packagesToInstall.push('cookies-next');
        if (!allDeps['next-auth']) packagesToInstall.push('next-auth');

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

      // 9. AuthGuard Components - REMOVED
      // Cleanup legacy AuthGuard directory if it exists
      const authGuardDir = path.join(apiTargetDir, 'src', 'api-services', 'AuthGuard');
      if (fs.existsSync(authGuardDir)) {
        try {
          fs.rmSync(authGuardDir, { recursive: true, force: true });
          console.log("[Generator] Removed legacy AuthGuard directory");
        } catch (e) {
          console.warn("[Generator] Failed to remove legacy AuthGuard directory", e);
        }
      }

      sseService.broadcast(Date.now().toString(), 'project:updated', 'Project generated');
      console.log("[Generator] Regeneration Complete");
      return { success: true, manifestKeys: moduleNames };
    } catch (e) {
      console.error("[Generator] Regeneration Failed:", e);
      throw e;
    }
  }
}

module.exports = new GeneratorService();
