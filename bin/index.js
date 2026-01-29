#!/usr/bin/env node

const path = require('path');
const { program } = require('commander');
const open = require('open');
const { startServer } = require('../server');

program
    .name('reex')
    .description('Reex API Builder - Local Bridge')
    .option('-p, --port <number>', 'Port to run the local server on', '4000')
    .option('-d, --dir <path>', 'Directory to manage (defaults to CWD)', process.cwd())
    .action(async (options) => {
        const port = parseInt(options.port);
        const targetDir = path.resolve(options.dir);

        console.log(`\n🚀 Starting Reex Local Bridge...`);
        console.log(`📂 Managing Directory: ${targetDir}`);
        console.log(`🔌 Port: ${port}`);

        // Set Environment Variables for the Server to consume
        process.env.API_TARGET_DIR = targetDir;
        process.env.PORT = port;
        // Force allow localhost:3000/4000/5173 and Vercel
        process.env.CORS_ORIGIN = "https://reex-api-client.vercel.app,http://localhost:5173,http://localhost:3000,http://localhost:4000";

        // Start the Server
        startServer(port);

        // Open the Hosted UI
        // We pass the local port so the UI knows where to connect
        const clientUrl = `https://reex-api-client.vercel.app/?localPort=${port}`;
        // const clientUrl = `http://localhost:3000/?localPort=${port}`;

        console.log(`\n🌐 Opening UI: ${clientUrl}`);
        await open(clientUrl);
        // Commented out 'open' for now to avoid popping windows during dev/testing, 
        // but in prod this should be enabled.
    });

program.parse();
