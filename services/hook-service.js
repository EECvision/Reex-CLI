const fs = require('fs');
const path = require('path');

class HookService {
    /**
     * Generates React Query hooks based on the API Manifest.
     * @param {string} targetDir - The root project directory
     * @param {Object} manifest - The JSON manifest { moduleName: { methodName: { args: [] } } }
     */
    generateHooks(targetDir, manifest) {
        const generatedDir = path.join(targetDir, 'src', 'api-services', 'generated');

        // Ensure output dir exists
        if (fs.existsSync(generatedDir)) {
            // Clean up old files? Or just overwrite. 
            // Better to clean to remove stale modules.
            try {
                fs.readdirSync(generatedDir).forEach(f => {
                    if (f.endsWith('.ts')) fs.unlinkSync(path.join(generatedDir, f));
                });
            } catch (e) {
                console.warn("[HookService] Failed to clean generated dir:", e);
            }
        } else {
            fs.mkdirSync(generatedDir, { recursive: true });
        }

        const modules = Object.keys(manifest);
        const hookFrequency = new Map(); // HookName -> Count

        // Phase 1: Analyze Hooks for Collisions
        modules.forEach(moduleName => {
            const methods = Object.keys(manifest[moduleName]);
            methods.forEach(method => {
                const hookName = this.getHookName(method);
                hookFrequency.set(hookName, (hookFrequency.get(hookName) || 0) + 1);
            });
        });

        const exportLines = [];

        // Phase 2: Generate Files
        modules.forEach(moduleName => {
            const methods = manifest[moduleName];
            const methodNames = Object.keys(methods);

            const hooks = [];
            let usedQuery = false;
            let usedMutation = false;

            // Generate content for each method
            methodNames.forEach(method => {
                const isQuery = method.startsWith('get_');
                if (isQuery) usedQuery = true;
                else usedMutation = true;

                const args = methods[method].args || [];
                const hookContent = this.toHookContent(method, args, moduleName);
                hooks.push(hookContent);
            });

            // File Structure
            const fileContent = `// Generated file - DO NOT EDIT
// This file contains React Query hooks for ${moduleName} API

import { ${moduleName}Api } from "../definitions/${moduleName}";
import { ${usedQuery ? 'useApiQuery, ' : ''}${usedMutation ? 'useApiMutation' : ''} } from ".";
${!usedQuery && !usedMutation ? '' : ''}

${hooks.join('\n\n')}
`;

            // Write Module File
            const pascalModule = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
            const fileName = `use${pascalModule}Queries.ts`;
            fs.writeFileSync(path.join(generatedDir, fileName), fileContent.replace(/, }/g, ' }'));

            // Prepare Index Export
            // Check for collisions in THIS module
            let hasConflict = false;
            const moduleHooks = methodNames.map(m => this.getHookName(m));

            for (const hook of moduleHooks) {
                if (hookFrequency.get(hook) > 1) {
                    hasConflict = true;
                    break;
                }
            }

            if (hasConflict) {
                // Alias exports
                const aliasedExports = moduleHooks.map(hook => {
                    const count = hookFrequency.get(hook);
                    if (count > 1) {
                        const aliased = hook.replace("use", `use${pascalModule}`);
                        return `  ${hook} as ${aliased},`;
                    }
                    return `  ${hook},`;
                }).join('\n');
                exportLines.push(`export {\n${aliasedExports}\n} from "./use${pascalModule}Queries";`);
            } else {
                exportLines.push(`export * from "./use${pascalModule}Queries";`);
            }
        });

        // Generate index.ts
        const indexContent = `import { useMutation, useQuery } from "@tanstack/react-query";

export const useApiMutation = <TData, TVariables>(
  mutationFn: (data: TVariables) => Promise<TData | undefined>
) =>
  useMutation < TData | undefined, unknown, TVariables> ({
    mutationFn,
  });

export const useApiQuery = <TData>(
  queryKey: string[],
  queryFn: () => Promise<TData | undefined>,
  options?: {
    enabled ?: boolean;
  staleTime?: number;
  cacheTime?: number;
  refetchOnWindowFocus?: boolean;
  }
) =>
  useQuery<TData | undefined>({
    queryKey,
    queryFn,
    ...options,
  });

${exportLines.join('\n')}
`;
        fs.writeFileSync(path.join(generatedDir, 'index.ts'), indexContent);
        console.log(`[HookService] Generated hooks in ${generatedDir}`);
    }

    getHookName(methodName) {
        const isQuery = methodName.startsWith("get_");
        const methodPrefix = methodName.split("_")[0];

        // e.g. get_users -> useUsersQuery
        // post_login -> useLoginMutation
        const suffix = methodName
            .split("_")
            .slice(1)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join("");

        return `use${methodPrefix.charAt(0).toUpperCase()}${methodPrefix.slice(1)}${suffix}${isQuery ? "Query" : "Mutation"}`;
    }

    toHookContent(methodName, args, moduleName) {
        const isQuery = methodName.startsWith("get_");
        const hookName = this.getHookName(methodName);

        // Type generation is tricky without TS compiler API.
        // But the previous script used `toTypeString`.
        // The manifest args already contain `type` string from my `project-service`.
        // So I can reconstruct it.

        if (isQuery) {
            if (args.length > 0) {
                const paramsType = this.buildType(args[0]);
                return `export const ${hookName} = (
  params: ${paramsType},
  options?: Parameters<typeof useApiQuery>[2]
) =>
  useApiQuery(
    ["${methodName}", JSON.stringify(params)],
    () => ${moduleName}Api.${methodName}(params),
    options
  );`;
            } else {
                return `export const ${hookName} = (
  options?: Parameters<typeof useApiQuery>[2]
) =>
  useApiQuery(
    ["${methodName}"],
    ${moduleName}Api.${methodName},
    options
  );`;
            }
        } else {
            return `export const ${hookName} = () =>
  useApiMutation(${moduleName}Api.${methodName});`;
        }
    }

    buildType(param) {
        if (!param) return "any";
        if (param.type && !param.isObject) return param.type;

        if (param.isObject && param.properties) {
            const inner = param.properties.map(p => {
                const nested = this.buildType(p);
                return `${p.name}${p.isOptional ? "?" : ""}: ${nested}`;
            }).join('; ');
            return `{ ${inner} }`;
        }
        return "any";
    }
}

module.exports = new HookService();
