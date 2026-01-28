const fs = require("fs");
const path = require("path");

class HookService {
  generateHooks(targetDir, manifest) {
    const generatedDir = path.join(
      targetDir,
      "src",
      "api-services",
      "generated"
    );

    // Clean generated directory safely
    if (fs.existsSync(generatedDir)) {
      fs.rmSync(generatedDir, { recursive: true, force: true });
    }
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
    modules.forEach((moduleName) => {
      const methods = manifest[moduleName];
      const methodNames = Object.keys(methods);
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
        return this.toHookContent(
          method,
          methods[method].args || [],
          moduleName,
          keyFactoryName
        );
      });

      const tanstackImports = [];
      if (usedMutation) tanstackImports.push("useQueryClient");
      const tanstackImportLine = tanstackImports.length
        ? `import { ${tanstackImports.join(", ")} } from "@tanstack/react-query";`
        : "";

      const commonImports = [
        usedQuery && "useApiQuery",
        usedMutation && "useApiMutation",
      ]
        .filter(Boolean)
        .join(", ");

      // 1. Generate the raw content first
      const rawContent = `// Generated file - DO NOT EDIT
${tanstackImportLine}
import { ${moduleName}Api } from "../definitions/${moduleName}";
${commonImports ? `import { ${commonImports} } from ".";` : ""}

${keyFactory}

${hooks.join("\n\n")}
`;

      // 2. Dynamically add the lint disable comment
      const fileContent = this.addLintDisableIfNeeded(rawContent);

      const pascalModule =
        moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
      const fileName = `use${pascalModule}Queries.ts`;
      fs.writeFileSync(path.join(generatedDir, fileName), fileContent);

      // Index exports
      const moduleHooks = methodNames.map((m) => this.getHookName(m));
      const hasConflict = moduleHooks.some((h) => hookFrequency.get(h) > 1);

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
    });

    this.generateIndexFile(generatedDir, exportLines);
  }

  // --- NEW HELPER ---
  addLintDisableIfNeeded(content) {
    // Regex matches the word "any" (boundary \b) to avoid matching "many", "company", etc.
    if (/\bany\b/.test(content)) {
      return `/* eslint-disable @typescript-eslint/no-explicit-any */\n${content}`;
    }
    return content;
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
        const args = methods[method].args || [];

        if (!args.length) {
          lines.push(
            `  ${method}: () => [...${moduleName}Keys.all, "${method}"] as const,`
          );
          return;
        }

        const sanitizedArgs = args.map((a) => ({
          ...a,
          name: this.getSafeArgName(a.name),
        }));

        const paramType = this.buildType({
          isObject: true,
          properties: sanitizedArgs,
        });

        lines.push(
          `  ${method}: (params: ${paramType}) => [...${moduleName}Keys.all, "${method}", params] as const,`
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

  toHookContent(methodName, args, moduleName, keyFactoryName) {
    const isQuery = methodName.startsWith("get_");
    const hookName = this.getHookName(methodName);

    const sanitizedArgs = (args || []).map((a) => ({
      ...a,
      name: this.getSafeArgName(a.name),
    }));

    if (isQuery) {
      if (!sanitizedArgs.length) {
        return `export const ${hookName} = (
  options?: Parameters<typeof useApiQuery>[2]
) =>
  useApiQuery(
    ${keyFactoryName}.${methodName}(),
    () => ${moduleName}Api.${methodName}(),
    options
  );`;
      }

      const paramType = this.buildType({
        isObject: true,
        properties: sanitizedArgs,
      });

      const apiArgs = sanitizedArgs
        .map((arg) => `params.${arg.name}`)
        .join(", ");

      return `export const ${hookName} = (
  params: ${paramType},
  options?: Parameters<typeof useApiQuery>[2]
) =>
  useApiQuery(
    ${keyFactoryName}.${methodName}(params),
    () => ${moduleName}Api.${methodName}(${apiArgs}),
    options
  );`;
    }

    // Mutation
    // Note: The 'as any' cast here will trigger the lint disable automatically
    return `export const ${hookName} = (
  options?: Omit<NonNullable<Parameters<typeof useApiMutation>[1]>, 'mutationFn'>
) => {
  const queryClient = useQueryClient();

  return useApiMutation(${moduleName}Api.${methodName}, {
    ...options,
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: ${keyFactoryName}.all });
      (options?.onSuccess as any)?.(data, variables, context);
    },
  });
};`;
  }

  buildType(param) {
    if (!param) return "any";
    if (param.type && !param.isObject) return param.type;
    if (param.isObject && param.properties) {
      return `{ ${param.properties
        .map(
          (p) =>
            `${p.name}${p.isOptional ? "?" : ""}: ${this.buildType(p)}`
        )
        .join("; ")} }`;
    }
    return "any";
  }

  generateIndexFile(generatedDir, exportLines) {
    const rawContent = `// Generated file - DO NOT EDIT
import {
  QueryKey,
  useMutation,
  useQuery,
  UseMutationOptions,
  UseQueryOptions,
} from "@tanstack/react-query";

export const useApiMutation = <TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: UseMutationOptions<TData, unknown, TVariables>
) =>
  useMutation({
    mutationFn,
    ...options,
  });

export const useApiQuery = <TData>(
  queryKey: QueryKey,
  queryFn: () => Promise<TData>,
  options?: Omit<
    UseQueryOptions<TData, unknown, TData, QueryKey>,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey,
    queryFn,
    refetchOnWindowFocus: false,
    retry: 1,
    ...options,
  });

${exportLines.join("\n")}
`;

    // Apply the check to index file as well
    const content = this.addLintDisableIfNeeded(rawContent);

    fs.writeFileSync(path.join(generatedDir, "index.ts"), content);
  }
}

module.exports = new HookService();