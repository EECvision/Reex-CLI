#!/usr/bin/env node

const path = require("path");
const { program } = require("commander");
const open = require("open");
const { startServer } = require("../server");

program
  .name("reex-build")
  .description(
    "Reex API Builder - Generate TypeScript types and React Query hooks from OpenAPI specs",
  )
  .version("1.0.0")
  .option("-p, --port <number>", "Port to run the local server on", "4000")
  .option(
    "-d, --dir <path>",
    "Directory to manage (defaults to CWD)",
    process.cwd(),
  )
  .option("--no-open", "Do not automatically open the browser")
  .action(async (options) => {
    const port = parseInt(options.port);
    const targetDir = path.resolve(options.dir);

    console.log(`\n🚀 Starting Reex API Builder...`);
    console.log(`📂 Managing Directory: ${targetDir}`);
    console.log(`🔌 Port: ${port}`);

    // Set Environment Variables for the Server to consume
    process.env.API_TARGET_DIR = targetDir;
    process.env.PORT = port;
    // Force allow localhost:3000/4000/5173 and Vercel
    process.env.CORS_ORIGIN =
      "https://reex-api-builder.toolshq.app,http://localhost:5173,http://localhost:3000,http://localhost:4000";

    // Start the Server
    startServer(port);

    // Open the Hosted UI
    const clientUrl = `https://reex-api-builder.toolshq.app/?localPort=${port}`;
    // const clientUrl = `http://localhost:3000/?localPort=${port}`;

    if (options.open !== false) {
      console.log(`\n🌐 Opening UI: ${clientUrl}`);
      await open(clientUrl);
    } else {
      console.log(`\n🌐 UI available at: ${clientUrl}`);
    }
  });

program.parse();
