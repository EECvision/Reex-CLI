#!/usr/bin/env node

const path = require("path");
const net = require("net");
const { program } = require("commander");
const open = require("open");
const readline = require("readline");
const { startServer } = require("../server");
const pkg = require("../package.json");
const generatorService = require("../services/generator-service");

// Helper function to find an open port
const findAvailablePort = (startingPort) => {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.listen(startingPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.log(`⚠️ Port ${startingPort} is in use, trying ${startingPort + 1}...`);
        resolve(findAvailablePort(startingPort + 1));
      } else {
        reject(err);
      }
    });
  });
};

program
  .name("reex")
  .description("Reex API Builder - Generate REST API, TypeScript types and React Query hooks from OpenAPI specs directly into your project")
  .version(pkg.version, '-v, -V, --version, --Version');

program
  .command("start")
  .description("Start the Reex API builder server")
  .option("-p, --port <number>", "Port to run the local server on", "4000")
  .option("-d, --dir <path>", "Directory to manage (defaults to CWD)", process.cwd())
  .option("--no-open", "Do not automatically open the browser")
  .action(async (options) => {
    try {
      let initialPort = parseInt(options.port, 10);
      if (isNaN(initialPort)) {
        console.error(`\n❌ Error: The port must be a valid number. You provided: "${options.port}"`);
        process.exit(1);
      }

      // Find an available port before doing anything else
      const finalPort = await findAvailablePort(initialPort);
      const targetDir = path.resolve(options.dir);

      console.log(`\n🚀 Starting Reex API Builder...`);
      console.log(`📂 Managing Directory: ${targetDir}`);
      console.log(`🔌 Port: ${finalPort}`);

      // Set Environment Variables for the Server to consume
      process.env.API_TARGET_DIR = targetDir;
      process.env.PORT = finalPort;
      process.env.CORS_ORIGIN =
        "https://studio.reex-api.dev,http://localhost:5173,http://localhost:3000,http://localhost:4000";

      const fs = require('fs');
      const apiServicesDir = fs.existsSync(path.join(targetDir, "src"))
        ? path.join(targetDir, "src", "api-services")
        : path.join(targetDir, "api-services");
      
      const reexDir = path.join(apiServicesDir, ".reex");
      if (!fs.existsSync(reexDir)) {
        fs.mkdirSync(reexDir, { recursive: true });
      }
      const metadataFile = path.join(reexDir, "metadata.json");
      let metadata = {};
      if (fs.existsSync(metadataFile)) {
        try {
          metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
        } catch (e) {}
      }
      
      // Update metadata with the new port while preserving existing data
      metadata.port = finalPort;
      fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

      // Start the Server with the guaranteed open port
      const { initialGenPromise } = startServer(finalPort);
      await initialGenPromise;

      // Construct the UI URL using the final port
      const clientUrl = `https://studio.reex-api.dev/?localPort=${finalPort}`;

      if (options.open !== false) {
        console.log(`\n🌐 Server is ready!`);
        console.log(`⚠️  REQUIRED: To sync your project, click "Allow" if your browser asks to "Access other apps and services on this device".`);
        
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        await new Promise(resolve => {
          rl.question(`\nPress Enter to open the Reex UI in your browser...`, () => {
            rl.close();
            resolve();
          });
        });

        console.log(`\nOpening UI: ${clientUrl}`);
        try {
          await open(clientUrl);
        } catch (openError) {
          console.warn(`\n⚠️ Could not open the browser automatically. Please visit the URL manually.`);
        }
      } else {
        console.log(`\n🌐 UI available at: ${clientUrl}`);
        console.log(`\n⚠️  IMPORTANT: If your browser prompts to "Access other apps and services on this device", you MUST click "Allow" to sync your project.`);
      }
    } catch (error) {
      console.error(`\n❌ An unexpected error occurred:`, error.message);
      process.exit(1);
    }
  });

program
  .command("reset [target]")
  .description("Reset scaffolded files or folders to their default templates")
  .option("-d, --dir <path>", "Directory to manage (defaults to CWD)", process.cwd())
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (target, options) => {
    const targetDir = path.resolve(options.dir);
    
    let message = target 
      ? `Are you sure you want to reset "${target}"? This will overwrite your custom changes.`
      : `Are you sure you want to reset ALL scaffolded files? This will overwrite your custom changes.`;

    if (!options.yes) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise(resolve => {
        rl.question(`\n⚠️  ${message} (Y/n): `, resolve);
      });

      rl.close();

      const normalizedAnswer = answer.trim().toLowerCase();
      if (normalizedAnswer !== '' && normalizedAnswer !== 'y' && normalizedAnswer !== 'yes') {
        console.log("Reset cancelled.");
        process.exit(0);
      }
    }

    try {
      console.log(`\n🔄 Resetting ${target || 'all scaffolded files'}...`);
      generatorService.resetScaffold(targetDir, target);
      console.log("✅ Reset complete.");
    } catch (err) {
      console.error("❌ Reset failed:", err.message);
      process.exit(1);
    }
  });



const fs = require("fs");
const http = require("http");

async function checkIfServerRunning(targetDir) {
  const apiServicesDir = fs.existsSync(path.join(targetDir, "src")) 
    ? path.join(targetDir, "src", "api-services") 
    : path.join(targetDir, "api-services");
  
  const metadataFile = path.join(apiServicesDir, ".reex", "metadata.json");
  if (!fs.existsSync(metadataFile)) return false;

  let metadata = {};
  try {
    metadata = JSON.parse(fs.readFileSync(metadataFile, "utf-8"));
  } catch (e) {
    return false;
  }

  const port = parseInt(metadata.port, 10);
  if (isNaN(port)) return false;

  try {
    const data = await new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${port}/api/health`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(body));
      });
      req.on('error', reject);
      req.setTimeout(300, () => reject(new Error('timeout')));
    });
    const json = JSON.parse(data);
    const normalize = (p) => p.replace(/\\/g, '/').toLowerCase();
    if (normalize(json.targetDir) === normalize(targetDir) || normalize(json.cwd) === normalize(targetDir)) {
      return true;
    }
  } catch (e) {
    // Stale port file, server crashed. Clean it up without destroying other metadata.
    try {
      delete metadata.port;
      fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
    } catch (err) {}
    return false;
  }
  return false;
}

const addCmd = program
  .command("add")
  .description("Add a new resource");

const removeCmd = program
  .command("remove")
  .description("Remove a resource");

const listCmd = program
  .command("list")
  .description("List available resources");

listCmd
  .command("hooks")
  .description("List all available utility hooks in the Reex repository")
  .action(() => {
    const sharedHooksDir = path.join(__dirname, "..", "templates-shared", "hooks");
    if (!fs.existsSync(sharedHooksDir)) {
      console.error(`\n❌ Error: Reex repository hooks not found.`);
      process.exit(1);
    }

    const hooks = fs.readdirSync(sharedHooksDir).filter(f => f.endsWith('.ts'));
    
    console.log(`\n📦 Available Hooks in Reex Repository:\n`);
    hooks.forEach(hook => {
       const hookName = hook.replace('.ts', '');
       const isCore = generatorService.CORE_HOOKS?.includes(hook) || generatorService.CORE_HOOKS?.includes(`${hookName}.ts`);
       console.log(`  - ${hookName} ${isCore ? '(Core)' : ''}`);
    });
    console.log(`\n💡 Install using: reex add hook <name>`);
  });

addCmd
  .command("module <name>")
  .description("Scaffold a new empty API module")
  .option("-d, --dir <path>", "Directory to manage (defaults to CWD)", process.cwd())
  .action(async (name, options) => {
    const targetDir = path.resolve(options.dir);
    const apiServicesDir = fs.existsSync(path.join(targetDir, "src")) 
      ? path.join(targetDir, "src", "api-services") 
      : path.join(targetDir, "api-services");
    
    const actualDefsDir = path.join(apiServicesDir, "definitions");

    if (!fs.existsSync(actualDefsDir)) {
      console.error(`\n❌ Error: api-services/definitions directory not found. Have you run 'reex start' yet?`);
      process.exit(1);
    }

    const templatePath = path.join(__dirname, "..", "templates-shared", "module.template.ts");
    const targetPath = path.join(actualDefsDir, `${name}.ts`);

    if (fs.existsSync(targetPath)) {
      console.error(`\n❌ Error: Module '${name}' already exists at ${targetPath}`);
      process.exit(1);
    }

    const typeName = name.charAt(0).toUpperCase() + name.slice(1);
    let template = fs.readFileSync(templatePath, "utf-8");
    
    template = template
      .replace(/__ModuleName__/g, name)
      .replace(/__TypeName__/g, typeName)
      .replace(/__ModuleNameSingular__/g, name.endsWith('s') ? name.slice(0, -1) : name);

    fs.writeFileSync(targetPath, template);
    console.log(`\n✅ Created new module '${name}'`);
    
    if (await checkIfServerRunning(targetDir)) {
      console.log(`\n⏳ Detected 'reex start' is running. Generation delegated to watcher.`);
    } else {
      await generatorService.regenerate(targetDir);
    }
  });

addCmd
  .command("hook <name>")
  .description("Add a utility hook from the Reex repository")
  .option("-d, --dir <path>", "Directory to manage (defaults to CWD)", process.cwd())
  .action(async (name, options) => {
    const targetDir = path.resolve(options.dir);
    const apiServicesDir = fs.existsSync(path.join(targetDir, "src")) 
      ? path.join(targetDir, "src", "api-services") 
      : path.join(targetDir, "api-services");
    
    const hooksDir = path.join(apiServicesDir, "hooks");
    if (!fs.existsSync(hooksDir)) {
      console.error(`\n❌ Error: api-services/hooks directory not found. Have you run 'reex start' yet?`);
      process.exit(1);
    }

    let providedHookName = name.endsWith('.ts') ? name : `${name}.ts`;
    const sharedHooksDir = path.join(__dirname, "..", "templates-shared", "hooks");
    
    if (!fs.existsSync(sharedHooksDir)) {
      console.error(`\n❌ Error: Reex repository hooks not found.`);
      process.exit(1);
    }

    const availableHooks = fs.readdirSync(sharedHooksDir);
    const actualHookFilename = availableHooks.find(f => f.toLowerCase() === providedHookName.toLowerCase());

    if (!actualHookFilename) {
      console.error(`\n❌ Error: Hook '${name.replace('.ts', '')}' not found in Reex repository.`);
      process.exit(1);
    }

    let pureName = actualHookFilename.replace('.ts', '');
    const sharedHookPath = path.join(sharedHooksDir, actualHookFilename);
    
    const targetPath = path.join(hooksDir, actualHookFilename);
    if (fs.existsSync(targetPath)) {
      console.error(`\n❌ Error: Hook '${pureName}' is already installed.`);
      process.exit(1);
    }

    fs.copyFileSync(sharedHookPath, targetPath);
    console.log(`\n✅ Installed hook '${pureName}'`);
  });

removeCmd
  .command("module <name>")
  .description("Remove an API module and purge its hooks")
  .option("-d, --dir <path>", "Directory to manage (defaults to CWD)", process.cwd())
  .action(async (name, options) => {
    const targetDir = path.resolve(options.dir);
    const apiServicesDir = fs.existsSync(path.join(targetDir, "src")) 
      ? path.join(targetDir, "src", "api-services") 
      : path.join(targetDir, "api-services");
      
    const targetPath = path.join(apiServicesDir, "definitions", `${name}.ts`);

    if (!fs.existsSync(targetPath)) {
      console.error(`\n❌ Error: Module '${name}' not found at ${targetPath}`);
      process.exit(1);
    }

    fs.unlinkSync(targetPath);
    console.log(`\n✅ Deleted module '${name}'`);
    
    if (await checkIfServerRunning(targetDir)) {
      console.log(`\n⏳ Detected 'reex start' is running. Generation delegated to watcher.`);
    } else {
      await generatorService.regenerate(targetDir);
    }
  });

removeCmd
  .command("hook <name>")
  .description("Remove an installed utility hook")
  .option("-d, --dir <path>", "Directory to manage (defaults to CWD)", process.cwd())
  .action(async (name, options) => {
    let pureName = name.replace('.ts', '');
    const isCore = generatorService.CORE_HOOKS?.includes(`${pureName}.ts`) || generatorService.CORE_HOOKS?.includes(pureName);
    if (isCore) {
      console.error(`\n❌ Error: '${pureName}' is a core hook and cannot be removed.`);
      process.exit(1);
    }

    const targetDir = path.resolve(options.dir);
    const apiServicesDir = fs.existsSync(path.join(targetDir, "src")) 
      ? path.join(targetDir, "src", "api-services") 
      : path.join(targetDir, "api-services");
    
    let hookFilename = pureName + '.ts';
    const targetPath = path.join(apiServicesDir, "hooks", hookFilename);

    if (!fs.existsSync(targetPath)) {
      console.error(`\n❌ Error: Hook '${pureName}' is not installed.`);
      process.exit(1);
    }

    fs.unlinkSync(targetPath);
    console.log(`\n✅ Removed hook '${pureName}'`);
  });

program
  .command("sync")
  .alias("update")
  .description("Manually synchronize and regenerate hooks and types from definitions")
  .option("-d, --dir <path>", "Directory to manage (defaults to CWD)", process.cwd())
  .action(async (options) => {
    const targetDir = path.resolve(options.dir);
    console.log(`\n🔄 Synchronizing Reex modules...`);
    
    const isRunning = await checkIfServerRunning(targetDir);
    if (isRunning) {
      console.log(`\n⏳ Detected 'reex start' is running. Sending sync request to server...`);
      const apiServicesDir = fs.existsSync(path.join(targetDir, "src")) ? path.join(targetDir, "src", "api-services") : path.join(targetDir, "api-services");
      const metadataFile = path.join(apiServicesDir, ".reex", "metadata.json");
      const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf-8"));
      
      const req = http.request({
        hostname: 'localhost',
        port: metadata.port,
        path: '/api/debug/regenerate',
        method: 'POST'
      }, (res) => {
        if (res.statusCode === 200) {
          console.log(`\n✅ Synchronization complete.`);
        } else {
          console.log(`\n❌ Synchronization failed with status: ${res.statusCode}`);
        }
      });
      req.on('error', (e) => console.error(`\n❌ Synchronization failed: ${e.message}`));
      req.end();
    } else {
      await generatorService.regenerate(targetDir);
      console.log(`\n✅ Synchronization complete.`);
    }
  });

// Graceful Shutdown
process.on("SIGINT", () => {
  console.log("\n\n👋 Shutting down Reex API Builder. Happy coding!");
  process.exit(0);
});

program.parse();