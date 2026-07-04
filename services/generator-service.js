const fs = require('fs');
const path = require('path');
const { API_SERVICES_RELATIVE_DIR } = require('../paths');
const projectService = require('./project-service');
const typeService = require('./type-service');
const hookService = require('./hook-service');

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
  regenerate(apiTargetDir) {
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
        ? path.join(__dirname, '../templates')
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



      // 3. core.ts - Managed by Bridge (Internal)
      const templateClientBuilderPath = resolveTemplateFile('core.ts');
      if (templateClientBuilderPath) {
        // ALWAYS updated by bridge
        fs.copyFileSync(templateClientBuilderPath, clientBuilderPath);
        console.log("[Generator] Updated core.ts from template");
      }


      // 2. Generate Manifest
      // Prune definition files first (remove unused interfaces/imports)
      projectService.pruneUnusedDefinitions(definitionsDir);

      const manifest = projectService.generateManifest(definitionsDir);

      // 3. Generate Hooks
      hookService.generateHooks(apiTargetDir, manifest);

      // 3b. Generate Types Folder
      typeService.generateTypes(apiTargetDir, manifest);

      // 3c. Sync Clients (Auto-Prune unused clients) - REMOVED (Replaced by static api-client/index.ts)

      // 4. Regenerate Barrel File (API_SERVICES_RELATIVE_DIR/definitions/index.ts)
      const moduleNames = Object.keys(manifest).sort();
      const barrelContent = `
${moduleNames.map((name) => `import { ${name}Api } from "./${name}";`).join('\n')}

export const api = {
${moduleNames.map((name) => `  ...${name}Api,`).join('\n')}
};
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

      const sharedProvidersDir = path.join(sharedTemplateDir, 'providers');
      if (fs.existsSync(sharedProvidersDir)) {
        this.copyRecursiveSync(sharedProvidersDir, providersDir);
      }

      const templateProvidersDir = path.join(templateBaseDir, 'providers');
      if (fs.existsSync(templateProvidersDir)) {
        this.copyRecursiveSync(templateProvidersDir, providersDir);
        console.log("[Generator] Copied providers from templates");
      } else {
        console.warn(`[Generator] Warning: ${framework} templates/providers directory not found`);
      }

      // 7b. Hooks (Copy from templates)
      const hooksDir = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR, 'hooks');
      if (!fs.existsSync(hooksDir)) {
        fs.mkdirSync(hooksDir, { recursive: true });
      }

      const sharedHooksDir = path.join(sharedTemplateDir, 'hooks');
      if (fs.existsSync(sharedHooksDir)) {
        this.copyRecursiveSync(sharedHooksDir, hooksDir);
      }

      const templateHooksDir = path.join(templateBaseDir, 'hooks');
      if (fs.existsSync(templateHooksDir)) {
        this.copyRecursiveSync(templateHooksDir, hooksDir);
        console.log("[Generator] Copied hooks from templates");
      } else {
        console.warn(`[Generator] Warning: ${framework} templates/hooks directory not found`);
      }

      // 7c. Auth (Copy from templates)
      const authDir = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR, 'auth');
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
      }

      const sharedAuthDir = path.join(sharedTemplateDir, 'auth');
      if (fs.existsSync(sharedAuthDir)) {
        this.copyRecursiveSync(sharedAuthDir, authDir);
      }

      const templateAuthDir = path.join(templateBaseDir, 'auth');
      if (fs.existsSync(templateAuthDir)) {
        this.copyRecursiveSync(templateAuthDir, authDir);
        console.log("[Generator] Copied auth from templates");
      } else {
        console.warn(`[Generator] Warning: ${framework} templates/auth directory not found`);
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
