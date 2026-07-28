const fs = require("fs");
const path = require("path");

class HookService {
  generateHooks(targetDir, manifest, changedModules = null) {
    const { API_SERVICES_RELATIVE_DIR } = require('../paths');
    const generatedDir = path.join(
      targetDir,
      API_SERVICES_RELATIVE_DIR,
      "generated"
    );

    
    fs.mkdirSync(generatedDir, { recursive: true });

    const modules = Object.keys(manifest);
    const hookFrequency = new Map();

    // Phase 1: Detect collisions
    modules.forEach((moduleName) => {
      Object.keys(manifest[moduleName]).forEach((method) => {
        const hook = this.getHookName(method);
        hookFrequency.set(hook, (hookFrequency.get(hook) || 0) + 1);
      });
    });

    const exportLines = [];

        // Phase 2: Generate module files
    const expectedFiles = new Set();
    expectedFiles.add(path.join(generatedDir, 'index.ts').replace(/\\/g, '/'));
    
    modules.forEach((moduleName) => {
      const pascalModule = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
      const fileName = `use${pascalModule}Queries.ts`;
      expectedFiles.add(path.join(generatedDir, fileName).replace(/\\/g, '/'));

      const methods = manifest[moduleName];
      const methodNames = Object.keys(methods);
      const moduleHooks = methodNames.map((m) => this.getHookName(m));
      const hasConflict = moduleHooks.some((h) => hookFrequency.get(h) > 1);

      // Always push to exportLines for index.ts
      if (hasConflict) {
        exportLines.push(
          `export {\n${moduleHooks
            .map((h) =>
              hookFrequency.get(h) > 1
                ? `  ${h} as ${h.replace("use", `use${pascalModule}`)},`
                : `  ${h},`
            )
            .join("\n")}\n} from "./use${pascalModule}Queries";`
        );
      } else {
        exportLines.push(`export * from "./use${pascalModule}Queries";`);
      }

      if (changedModules && !changedModules.includes(moduleName)) {
        return; // Skip actual file generation
      }

      const keyFactoryName = `${moduleName}Keys`;

      let usedQuery = false;
      let usedMutation = false;

      methodNames.forEach((method) => {
        if (method.startsWith("get_")) usedQuery = true;
        else usedMutation = true;
      });

      const keyFactory = this.generateKeyFactory(
        moduleName,
        methodNames,
        methods
      );

      const hooks = methodNames.map((method) => {
        const methodDef = methods[method];
        return this.toHookContent(
          method,
          methodDef.args || [],
          moduleName,
          keyFactoryName,
          methodDef.requiresAuth,
          methodDef.contentType
        );
      });

      // Build Imports
      const tanstackImports = [];
      if (usedMutation) {
        tanstackImports.push("useQueryClient");
        tanstackImports.push("type UseMutationOptions");
      }
      if (usedQuery) {
        tanstackImports.push("type UseQueryOptions");
      }

      const tanstackImportLine = tanstackImports.length > 0
        ? `import { ${tanstackImports.join(", ")} } from "@tanstack/react-query";`
        : "";

      const commonImports = [
        usedQuery && "useApiQuery",
        usedMutation && "useApiMutation",
      ]
        .filter(Boolean)
        .join(", ");

      // 1. Generate the raw content
      const rawContent = `// Generated file - DO NOT EDIT
${tanstackImportLine}
import { ${moduleName}Api } from "../definitions/${moduleName}";
${commonImports ? `import { ${commonImports} } from ".";` : ""}

// Helper Types
type ApiData<T extends (...args: any) => any> = Awaited<ReturnType<T>>;
type ApiVars<T extends (...args: any) => any> = Parameters<T> extends [] ? void : Parameters<T>[0];

${keyFactory}

${hooks.join("\n\n")}
`;

      // 2. Add lint disable
      const fileContent = `/* eslint-disable @typescript-eslint/no-explicit-any */\n${rawContent}`;
      fs.writeFileSync(path.join(generatedDir, fileName), fileContent);
    });

    this.generateIndexFile(generatedDir, exportLines);

    // Phase 3: Cleanup Old Files (e.g. from deleted definitions)
    if (fs.existsSync(generatedDir)) {
      const entries = fs.readdirSync(generatedDir);
      for (const entry of entries) {
        const fullPath = path.join(generatedDir, entry).replace(/\\/g, '/');
        if (!expectedFiles.has(fullPath)) {
          try {
            fs.unlinkSync(fullPath);
            console.log(`[Generator] Cleaned up obsolete generated file: ${entry}`);
          } catch (e) {
            console.error(`[Generator] Failed to clean up generated file ${entry}:`, e.message);
          }
        }
      }
    }
  }

  getSafeArgName(name) {
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) return name;
    return "params";
  }

  generateKeyFactory(moduleName, methodNames, methods) {
    const lines = [
      `export const ${moduleName}Keys = {`,
      `  all: ["${moduleName}"] as const,`,
    ];

    methodNames
      .filter((m) => m.startsWith("get_"))
      .forEach((method) => {
        const hasArgs = methods[method].args && methods[method].args.length > 0;

        // Strict typing: If args exist, param is mandatory. If not, it's optional/void.
        const paramDef = hasArgs
          ? `params: ApiVars<typeof ${moduleName}Api.${method}>`
          : `params?: ApiVars<typeof ${moduleName}Api.${method}>`;

        lines.push(
          `  ${method}: (${paramDef}) => [...${moduleName}Keys.all, "${method}", params] as const,`
        );
      });

    lines.push("};");
    return lines.join("\n");
  }

  getHookName(methodName) {
    const isQuery = methodName.startsWith("get_");
    const [prefix, ...rest] = methodName.split("_");
    const suffix = rest
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("");
    const cleanPrefix = prefix
      ? prefix.charAt(0).toUpperCase() + prefix.slice(1)
      : "";
    return `use${cleanPrefix}${suffix}${isQuery ? "Query" : "Mutation"}`;
  }

  toHookContent(
    methodName,
    args,
    moduleName,
    keyFactoryName,
    requiresAuth = false,
    contentType = undefined
  ) {
    const isQuery = methodName.startsWith("get_");
    const hookName = this.getHookName(methodName);

    const apiMethod = `${moduleName}Api.${methodName}`;
    const apiData = `ApiData<typeof ${apiMethod}>`;
    const apiVars = `ApiVars<typeof ${apiMethod}>`;

    const jsDocLines = [];
    if (requiresAuth) jsDocLines.push(" * @auth");
    if (contentType) jsDocLines.push(` * @contentType ${contentType}`);

    const jsDoc =
      jsDocLines.length > 0
        ? `/**\n${jsDocLines.join("\n")}\n */\n`
        : "";

    if (isQuery) {
      const hasArgs = args && args.length > 0;

      // Case 1: API takes arguments (e.g. { id: '123' })
      if (hasArgs) {
        return `${jsDoc}export const ${hookName} = <TData = ${apiData}>(
  params: ${apiVars},
  options?: Omit<
    UseQueryOptions<${apiData}, Error, TData>,
    "queryKey" | "queryFn"
  >
) =>
  useApiQuery(
    ${keyFactoryName}.${methodName}(params),
    () => ${apiMethod}(params),
    options
  );`;
      }

      // Case 2: API takes NO arguments (cleaner signature)
      return `${jsDoc}export const ${hookName} = <TData = ${apiData}>(
  options?: Omit<
    UseQueryOptions<${apiData}, Error, TData>,
    "queryKey" | "queryFn"
  >
) =>
  useApiQuery(
    ${keyFactoryName}.${methodName}(),
    () => ${apiMethod}(),
    options
  );`;
    }

    // Mutation
    // We assume mutations take 1 argument (variables) or void.
    // The inference handles both correctly.
    return `${jsDoc}export const ${hookName} = (
  options?: Omit<
    UseMutationOptions<${apiData}, Error, ${apiVars}>,
    "mutationFn"
  >
) => {
  const queryClient = useQueryClient();

  return useApiMutation(${apiMethod}, {
    ...options,
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: ${keyFactoryName}.all });
      (options?.onSuccess as any)?.(data, variables, context);
    },
  });
};`;
  }

  generateIndexFile(generatedDir, exportLines) {
    const content = `
// Generated file - DO NOT EDIT
import {
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
  type UseQueryResult,
  type DefaultError,
  useMutation,
  useQuery,
} from "@tanstack/react-query";

import { getActiveProvider } from "../auth-methods/manager";

// 1. Mutation Wrapper
export const useApiMutation = <
  TData = unknown,
  TVariables = void,
  TError = DefaultError,
  TContext = unknown,
>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: Omit<
    UseMutationOptions<TData, TError, TVariables, TContext>,
    "mutationFn"
  >,
) => {
  return useMutation<TData, TError, TVariables, TContext>({
    mutationFn,
    ...options,
  });
};

// 2. Query Wrapper
export const useApiQuery = <
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  queryKey: TQueryKey,
  queryFn: () => Promise<TQueryFnData>,
  options?: Omit<
    UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<TData, TError> => {
  const isEnabled =
    options?.enabled !== false ? !!getActiveProvider()?.getToken?.() : false;

  return useQuery<TQueryFnData, TError, TData, TQueryKey>({
    queryKey,
    queryFn,
    refetchOnWindowFocus: false,
    retry: 1,
    ...options,
    enabled: isEnabled,
  });
};

${exportLines.join("\n")}
`;
    fs.writeFileSync(path.join(generatedDir, "index.ts"), content);
  }
}

module.exports = new HookService();