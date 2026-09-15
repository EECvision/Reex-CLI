# Reex CLI discovery metadata

The package remains `reex-cli`, exposing the `reex` command. It is the CLI for Reex API, the React framework for API integration.

`package.json` supplies the npm description, focused package-search keywords, and `https://www.reex-api.dev` homepage. The source repository and issue tracker keep their actual CLI URLs. README content, runtime code, dependencies, executable, and version are unchanged.

`seo/brand.json` is the shared identity contract copied across all four repositories. It is a development reference, excluded from the published package by the existing `files` allowlist. Run `npm run check:seo:workspace` from the adjacent Studio repository to verify consistency, including this package's description, homepage, keywords, and executable.

## Validation and release

`npm pack --dry-run --json` verifies the package contents. When the configured npm cache is outside the writable workspace, pass `--cache ./node_modules/.cache/npm-seo`. The inspected package includes 45 files and retains its executable and existing runtime files.

The current `npm test` script (`node --test tests/`) does not discover the directory under Node 24 on this Windows environment. Running the three test files explicitly exercises the suite: hook and project-service tests pass, while the existing server integration fixture fails scaffolding/restoration/regeneration checks because its temporary project has no package.json. These tests and runtime files were not changed by the metadata update.

Publish the metadata with the next normal package release, using the version appropriate at release time. A repository change alone does not update the npm listing. After publication, verify the description, homepage, keywords, and actual version at `https://registry.npmjs.org/reex-cli/latest`.

npm controls its website HTML head, canonicals, and structured data. The package cannot be submitted through the Reex website's Search Console property. No publication was performed during local implementation.

