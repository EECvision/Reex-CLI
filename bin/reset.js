#!/usr/bin/env node

const path = require("path");
const { program } = require("commander");
const readline = require("readline");
const generatorService = require("../services/generator-service");

program
  .name("reex-reset")
  .description("Reset scaffolded files or folders to their default templates")
  .argument("[target]", "Target file or folder to reset (e.g., api.config.ts, core.ts, auth-methods, providers, hooks)")
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

program.parse();
