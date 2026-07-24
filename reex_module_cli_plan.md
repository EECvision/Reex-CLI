# Goal
Implement a robust nested CLI command structure for managing API modules: `reex module add <name>` and `reex module remove <name>`.

## Proposed Changes

### `bin/index.js`
#### [MODIFY] `bin/index.js`
We will use Commander's nested subcommand feature to group module operations:

1. **Top-level Command:** `program.command("module")`
2. **Add Subcommand:** `.command("add <moduleName>")`
   - Will create `api-services/definitions/<moduleName>.ts` using the full GET/POST/PUT/DELETE CRUD template extracted from `route.ts`.
   - Will automatically trigger `generatorService.regenerate()` so hooks are compiled instantly.
3. **Remove Subcommand:** `.command("remove <moduleName>")`
   - Will safely delete `api-services/definitions/<moduleName>.ts` if it exists.
   - Will automatically trigger `generatorService.regenerate()` so the removed module's hooks and types are purged from the project.

## Why this is the best architecture
By defining `module` as a namespace with verbs (`add`, `remove`), we keep the root CLI incredibly clean while giving users predictable behaviors. If we ever want to let users list all their modules in the terminal, we can just add `reex module list`.

## Verification Plan
- Run `node bin/index.js module add products` and verify scaffolding and hook generation.
- Run `node bin/index.js module remove products` and verify deletion and hook pruning.
