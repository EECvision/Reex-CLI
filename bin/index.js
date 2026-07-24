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
  .version(pkg.version);

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
        "https://reex-api-builder.toolshq.app,http://localhost:5173,http://localhost:3000,http://localhost:4000";

      // Start the Server with the guaranteed open port
      startServer(finalPort);

      // Construct the UI URL using the final port
      const clientUrl = `https://reex-api-builder.toolshq.app/?localPort=${finalPort}`;

      if (options.open !== false) {
        console.log(`\n🌐 Opening UI: ${clientUrl}`);
        try {
          await open(clientUrl);
        } catch (openError) {
          console.warn(`\n⚠️ Could not open the browser automatically. Please visit the URL manually.`);
        }
      } else {
        console.log(`\n🌐 UI available at: ${clientUrl}`);
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



// Graceful Shutdown
process.on("SIGINT", () => {
  console.log("\n\n👋 Shutting down Reex API Builder. Happy coding!");
  process.exit(0);
});

program.parse();