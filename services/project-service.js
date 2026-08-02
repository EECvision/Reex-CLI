const fs = require("fs");
const path = require("path");
const { Project, SyntaxKind } = require("ts-morph");
const dotenv = require("dotenv");
const { getInitializerObject } = require("../utils/ast");

class ProjectService {
    constructor() {
        this.project = null;
    }

    /**
     * Generates the API manifest from the target directory.
     * @param {string} targetDir - The directory containing API definitions.
     * @returns {Object} The generated manifest object.
     */
    generateManifest(targetDir) {
        if (!fs.existsSync(targetDir)) {
            console.warn(`[ProjectService] Warning: Target directory not found: ${targetDir}`);
            return {};
        }

        this.project = new Project({
            compilerOptions: {
                allowJs: true,
                declaration: true,
                emitDeclarationOnly: true,
            },
            skipAddingFilesFromTsConfig: true,
        });

        const files = fs.readdirSync(targetDir).filter((f) => f.endsWith(".ts") && f !== "index.ts");
        const apiManifest = {};

        for (const file of files) {
            const moduleName = file.replace(".ts", "");
            const filePath = path.join(targetDir, file);
            const sourceFile = this.project.addSourceFileAtPath(filePath);
            const moduleExports = {};
            const exports = sourceFile.getExportedDeclarations();
            let count = 0;

            for (const [exportName, declarations] of exports) {
                for (const declaration of declarations) {
                    const kind = declaration.getKind();
                    if (kind === SyntaxKind.VariableDeclaration) {
                        const initializer = getInitializerObject(declaration);

                        if (initializer) {
                            const properties = initializer.getProperties();
                            for (const property of properties) {
                                if (property.getKind() === SyntaxKind.PropertyAssignment) {
                                    const methodName = property.getName();
                                    const init = property.getInitializer();

                                    // Helper to extract metadata from function body
                                    const extractMetadata = (funcNode) => {
                                        let client = "UNKNOWN_CLIENT";
                                        let url = "";
                                        let method = "GET"; // Default

                                        // Extract URL, client, and method from inline apiClient.method(`/path`) calls
                                        // Generated definitions use: apiClient.get(`/api/v1/path`)
                                        //                       or: apiClient.post(`/api/v1/path/${id}`, payload)
                                        const body = funcNode.getBody();
                                        const callExprs = [];
                                        // Concise arrow functions (no block body) have the CallExpression as the body itself
                                        // getDescendantsOfKind does NOT include the node itself, so we must check it explicitly
                                        if (body.getKind() === SyntaxKind.CallExpression) {
                                            callExprs.push(body);
                                        }
                                        callExprs.push(...body.getDescendantsOfKind(SyntaxKind.CallExpression));

                                        for (const call of callExprs) {
                                            const expr = call.getExpression();

                                            if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
                                                const methodName = expr.getName();
                                                const objectName = expr.getExpression().getText();

                                                // Match CLIENT.get/post/put/delete/patch calls
                                                if (["get", "post", "put", "delete", "patch"].includes(methodName)) {
                                                    client = objectName;
                                                    method = methodName.toUpperCase();

                                                    // Extract URL from first argument (template literal or string)
                                                    const firstArg = call.getArguments()[0];
                                                    if (firstArg) {
                                                        if (firstArg.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
                                                            url = firstArg.getLiteralValue();
                                                        } else if (firstArg.getKind() === SyntaxKind.TemplateExpression) {
                                                            // Handle `/path/${id}/retry` -> reconstruct with ${param} syntax
                                                            let reconstructed = firstArg.getHead().getLiteralText();
                                                            for (const span of firstArg.getTemplateSpans()) {
                                                                reconstructed += "${" + span.getExpression().getText() + "}" + span.getLiteral().getLiteralText();
                                                            }
                                                            url = reconstructed;
                                                        } else if (firstArg.getKind() === SyntaxKind.StringLiteral) {
                                                            url = firstArg.getLiteralValue();
                                                        }
                                                    }
                                                    break; // Found the API call, stop searching
                                                }
                                            }
                                        }


                                        return { client, url, method };
                                    };

                                    // Expand args
                                    if (init && (init.getKind() === SyntaxKind.ArrowFunction || init.getKind() === SyntaxKind.FunctionExpression)) {
                                        try {
                                            const params = init.getParameters().map(p => this.getParameterDetails(p, sourceFile));
                                            const metadata = extractMetadata(init);

                                            // Check for @auth in leading comments on the PropertyAssignment
                                            let requiresAuth = false;
                                            const fullText = sourceFile.getFullText();
                                            const leadingComments = property.getLeadingCommentRanges();
                                            let contentType = undefined;
                                            for (const comment of leadingComments) {
                                                const commentText = fullText.substring(comment.getPos(), comment.getEnd());
                                                if (commentText.includes("@auth")) {
                                                    requiresAuth = true;
                                                }
                                                // Parse @contentType value
                                                const contentTypeMatch = commentText.match(/@contentType\s+(\S+)/);
                                                if (contentTypeMatch) {
                                                    contentType = contentTypeMatch[1];
                                                }
                                            }

                                            moduleExports[methodName] = { args: params, ...metadata, requiresAuth, contentType };
                                            count++;
                                        } catch (err) {
                                            console.error(`[ProjectService] Error processing ${methodName}:`, err);
                                        }
                                    } else {
                                        // console.log(`[ProjectService] Skipping ${methodName} - Kind: ${init ? init.getKind() : 'None'}`);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // console.log(`[ProjectService] Module ${moduleName} exports:`, Object.keys(moduleExports));

            if (count) {
                apiManifest[moduleName] = moduleExports;
            }
        }

        return apiManifest;
    }

    /**
     * Prunes unused interfaces, types, and imports from definition files.
     * @param {string} targetDir - The directory containing API definitions.
     */
    async pruneUnusedDefinitions(targetDir, changedModules = null) {
        console.log(`[ProjectService] Starting Prune in: ${targetDir}`);
        if (!fs.existsSync(targetDir)) {
            console.log(`[ProjectService] Target dir does not exist: ${targetDir}`);
            return;
        }

        // Re-initialize project to ensure fresh state
        this.project = new Project({
            skipAddingFilesFromTsConfig: true,
        });

        const files = fs.readdirSync(targetDir).filter((f) => f.endsWith(".ts") && f !== "index.ts");
        console.log(`[ProjectService] Found ${files.length} definition files to check.`);

        for (const file of files) {
            const filePath = path.join(targetDir, file);
            const sourceFile = this.project.addSourceFileAtPath(filePath);
            const moduleName = file.replace(".ts", "");
            if (changedModules && !changedModules.includes(moduleName)) continue;

            // Find the API Object (e.g. const accountReportsApi = { ... })
            // We assume standard naming convention: moduleName + "Api"
            // If not found, we might skip or try to find ANY exported object.
            // Let's stick to the convention used by the generator.
            const variableDecl = sourceFile.getVariableDeclaration(`${moduleName}Api`);

            if (variableDecl) {
                const apiObjectText = variableDecl.getInitializer()?.getText() || "";
                let modified = false;

                // 1. Types & Interfaces
                const isUsed = (name) => {
                    // Check usage in API Object
                    if (apiObjectText.includes(name)) return true;

                    // Check usage in other interfaces/types (simple text check)
                    let usedInOthers = false;
                    sourceFile.getInterfaces().forEach(i => {
                        if (i.getName() !== name && i.getText().includes(name)) usedInOthers = true;
                    });
                    if (usedInOthers) return true;

                    sourceFile.getTypeAliases().forEach(t => {
                        if (t.getName() !== name && t.getText().includes(name)) usedInOthers = true;
                    });
                    return usedInOthers;
                };

                const definitionsToRemove = [];
                sourceFile.getInterfaces().forEach(iface => {
                    if (!isUsed(iface.getName())) definitionsToRemove.push(iface.getName());
                });
                sourceFile.getTypeAliases().forEach(typeAlias => {
                    if (!isUsed(typeAlias.getName())) definitionsToRemove.push(typeAlias.getName());
                });

                definitionsToRemove.forEach(name => {
                    const i = sourceFile.getInterface(name);
                    if (i) { i.remove(); modified = true; }
                    const t = sourceFile.getTypeAlias(name);
                    if (t) { t.remove(); modified = true; }
                });

                // 2. Imports
                // Heuristic: Check if the name appears in the code *outside* of the import declaration itself.
                // We strip strings and comments to avoid matching module paths or JSDoc.
                const fullText = sourceFile.getText();
                const strippedText = fullText
                    .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
                    .replace(/\/\/.*/g, '')           // strip line comments
                    .replace(/"[^"]*"/g, '""')        // strip double quote strings
                    .replace(/'[^']*'/g, "''")        // strip single quote strings
                    .replace(/`[^`]*`/g, "``");       // strip backtick strings

                sourceFile.getImportDeclarations().forEach(importDecl => {
                    const namedImports = importDecl.getNamedImports();
                    if (namedImports.length > 0) {
                        const unused = namedImports.filter(ni => {
                            const name = ni.getName();

                            // 1. Check if it's used in the stripped text (code only)
                            // The name in the import declaration { Name } is NOT stripped because it's not a string.
                            // So we expect exactly 1 match (the import specifier itself).
                            // If there are > 1 matches, it's used elsewhere in code.
                            const regex = new RegExp(`\\b${name}\\b`, 'g');
                            const matches = strippedText.match(regex);

                            return !matches || matches.length <= 1;
                        });

                        if (unused.length > 0) {
                            unused.forEach(u => {
                                console.log(`[ProjectService] Removing unused import: ${u.getName()} from ${file}`);
                                u.remove();
                            });
                            modified = true;
                        }
                    }

                    // Remove empty import declarations
                    if (importDecl.getNamedImports().length === 0 && !importDecl.getNamespaceImport() && !importDecl.getDefaultImport()) {
                        importDecl.remove();
                        modified = true;
                    }
                });

                if (modified) {
                    try {
                        const rawText = sourceFile.getFullText();
                        const filePath = sourceFile.getFilePath();
                        try {
                            const prettier = require('prettier');
                            const options = await prettier.resolveConfig(filePath) || {};
                            options.filepath = filePath;
                            options.pluginSearchDirs = [process.cwd()];
                            const formattedText = await prettier.format(rawText, options);
                            fs.writeFileSync(filePath, formattedText, 'utf8');
                        } catch(err) {
                            console.warn('[Prettier] Failed to format, falling back to ts-morph:', err.message);
                            sourceFile.saveSync();
                        }
                        console.log(`[ProjectService] Pruned unused code from ${file}`);
                    } catch (e) {
                        console.error(`[ProjectService] Failed to save pruned file ${file}:`, e);
                    }
                } else {
                    // console.log(`[ProjectService] No unused code found in ${file}`);
                }
            } else {
                console.warn(`[ProjectService] Could not find API object in ${file} (Expected ${moduleName}Api)`);
            }
        }
    }

    /**
     * Reads the project config directly from core.ts and clients.ts.
     * @param {string} apiTargetDir - Path to the root of the user project
     */
    getProjectConfig(apiTargetDir) {
        const { API_SERVICES_RELATIVE_DIR } = require('../paths');
        const apiServicesDir = path.join(apiTargetDir, API_SERVICES_RELATIVE_DIR);

        if (!fs.existsSync(apiServicesDir)) return { baseURL: "http://localhost:3000/api", clients: {}, clientPrefixes: {} };
        const corePath = path.join(apiServicesDir, "core.ts");
        const clientsPath = path.join(apiServicesDir, "clients.ts");

        const config = { clients: {}, clientPrefixes: {} };
        const project = new Project({ skipAddingFilesFromTsConfig: true });

        // constants.ts and auth.ts were merged into api.config.ts
        const apiConfigPath = path.join(apiServicesDir, "api.config.ts");

        // 1. Get BaseURL from api.config.ts (preferred) or core.ts (fallback)
        const configSourcePath = fs.existsSync(apiConfigPath) ? apiConfigPath : corePath;

        if (fs.existsSync(configSourcePath)) {
            const sourceFile = project.addSourceFileAtPath(configSourcePath);

            // Resolve Env Vars logic (Simplified Copy)
            const projectRoot = apiTargetDir;
            const envConfig = {};
            [".env", ".env.local"].forEach(envFile => {
                const envPath = path.join(projectRoot, envFile);
                if (fs.existsSync(envPath)) {
                    const parsed = dotenv.parse(fs.readFileSync(envPath));
                    Object.assign(envConfig, parsed);
                }
            });

            const resolveValue = (node) => {
                if (!node) return undefined;

                // Unwrap type assertions, non-null assertions, and parentheses
                let current = node;
                while (
                    current.getKind() === SyntaxKind.AsExpression ||
                    current.getKind() === SyntaxKind.TypeAssertion ||
                    current.getKind() === SyntaxKind.NonNullExpression ||
                    current.getKind() === SyntaxKind.SatisfiesExpression ||
                    current.getKind() === SyntaxKind.ParenthesizedExpression
                ) {
                    current = current.getExpression();
                }

                if (current.getKind() === SyntaxKind.StringLiteral) return current.getLiteralValue();
                if (current.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) return current.getLiteralText();
                
                if (current.getKind() === SyntaxKind.PropertyAccessExpression) {
                    const text = current.getText();
                    if (text.startsWith("process.env.")) {
                        const varName = text.replace("process.env.", "");
                        return envConfig[varName] || process.env[varName];
                    }
                    if (text.startsWith("import.meta.env.")) {
                        const varName = text.replace("import.meta.env.", "");
                        return envConfig[varName] || process.env[varName];
                    }
                }
                
                if (current.getKind() === SyntaxKind.Identifier) {
                    const name = current.getText();
                    const decl = sourceFile.getVariableDeclaration(name);
                    if (decl) {
                        return resolveValue(decl.getInitializer());
                    }
                }
                
                if (current.getKind() === SyntaxKind.BinaryExpression) {
                    const operator = current.getOperatorToken().getText();
                    if (operator === "||" || operator === "??") {
                        const leftVal = resolveValue(current.getLeft());
                        if (operator === "||") {
                            if (leftVal) return leftVal;
                            return resolveValue(current.getRight());
                        } else if (operator === "??") {
                            if (leftVal !== undefined && leftVal !== null) return leftVal;
                            return resolveValue(current.getRight());
                        }
                    }
                }
                
                return undefined;
            };

            // Try extracting from apiConfig object
            let foundBaseURL = undefined;
            const apiConfigDecl = sourceFile.getVariableDeclaration("apiConfig");
            
            if (apiConfigDecl) {
                const initializer = getInitializerObject(apiConfigDecl);

                if (initializer) {
                    const prop = initializer.getProperty("baseURL");
                    if (prop) {
                        let valNode = null;
                        
                        if (prop.getKind() === SyntaxKind.PropertyAssignment) {
                            valNode = prop.getInitializer();
                        } else if (prop.getKind() === SyntaxKind.ShorthandPropertyAssignment) {
                            const nameNode = prop.getNameNode();
                            const decl = sourceFile.getVariableDeclaration(nameNode.getText());
                            if (decl) {
                                valNode = decl.getInitializer();
                            }
                        }

                        if (valNode) {
                            foundBaseURL = resolveValue(valNode);
                        }
                    }
                }
            }

            if (foundBaseURL !== undefined && foundBaseURL !== null) {
                config.baseURL = foundBaseURL;
            } else {
                config.baseURL = "http://localhost:3000/api";
            }
        } else {
            config.baseURL = "http://localhost:3000/api";
        }

        // 2. Get Clients from clients.ts
        if (fs.existsSync(clientsPath)) {
            const sourceFile = project.createSourceFile("temp_clients.ts", fs.readFileSync(clientsPath, 'utf8'), { overwrite: true });

            const variableDecls = sourceFile.getVariableDeclarations();
            for (const decl of variableDecls) {
                if (decl.isExported()) {
                    const name = decl.getName();
                    const initializer = decl.getInitializer();

                    if (initializer && initializer.getKind() === SyntaxKind.CallExpression) {
                        const expression = initializer.getExpression();
                        if (expression.getText() === "createClient") {
                            const args = initializer.getArguments();
                            let clientPath = "";

                            if (args.length > 0) {
                                const argText = args[0].getText();
                                if (argText.startsWith('"') || argText.startsWith("'") || argText.startsWith("`")) {
                                    clientPath = argText.slice(1, -1);
                                }
                            }

                            const base = (config.baseURL || "").replace(/\/$/, "");
                            const suffix = clientPath.startsWith("/") ? clientPath : `/${clientPath}`;
                            config.clients[name] = clientPath ? `${base}${suffix}` : base;

                            if (clientPath) {
                                const cleanPrefix = clientPath.startsWith('/') ? clientPath : '/' + clientPath;
                                config.clientPrefixes[cleanPrefix] = name;
                            }
                        }
                    }
                }
            }
        }

        // 3. Get metadata from metadata.json
        const metadataPath = path.join(apiServicesDir, ".reex", 'metadata.json');
        if (fs.existsSync(metadataPath)) {
            try {
                const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                if (metadata.collectionName) {
                    config.collectionName = metadata.collectionName;
                }
            } catch (e) {
                console.warn('[ProjectService] Failed to parse metadata.json:', e);
            }
        }

        return config;
    }

    expandTypeRecursively(typeNode, sourceFile) {
        if (!typeNode) return null;

        const kind = typeNode.getKind();

        
        // Union Type: MyPayload | FormData
        if (kind === SyntaxKind.UnionType) {
            const unionTypes = typeNode.getTypeNodes ? typeNode.getTypeNodes() : [];
            for (const member of unionTypes) {
                const memberText = member.getText ? member.getText() : "";
                if (memberText === "FormData" || memberText === "any") continue;
                const expanded = this.expandTypeRecursively(member, sourceFile);
                if (expanded && expanded.isObject) {
                    return expanded;
                }
            }
            for (const member of unionTypes) {
                const expanded = this.expandTypeRecursively(member, sourceFile);
                if (expanded) return expanded;
            }
            return { type: typeNode.getText ? typeNode.getText() : "" };
        }

        // Object Literal: { foo: string }
        if (kind === SyntaxKind.TypeLiteral) {
            return {
                isObject: true,
                properties: typeNode.getProperties().map((prop) => {
                    const name = prop.getName();
                    const optional = prop.hasQuestionToken ? prop.hasQuestionToken() : false;
                    const propTypeNode = prop.getTypeNode();

                    const nested = this.expandTypeRecursively(propTypeNode, sourceFile);
                    if (nested) {
                        return { name, isOptional: optional, ...nested };
                    }

                    return {
                        name,
                        isOptional: optional,
                        type: prop.getType().getText(),
                    };
                }),
            };
        }

        // Type Reference: MyInterface
        if (kind === SyntaxKind.TypeReference) {
            const typeName = typeNode.getTypeName().getText();

            // Find declaration in the file
            const declaration =
                sourceFile.getInterfaces().find((i) => i.getName() === typeName) ||
                sourceFile.getTypeAliases().find((t) => t.getName() === typeName);

            if (!declaration) return { type: typeName };

            let props = [];

            if (declaration.getKind() === SyntaxKind.InterfaceDeclaration) {
                props = declaration.getProperties();
            } else if (declaration.getKind() === SyntaxKind.TypeAliasDeclaration) {
                const tn = declaration.getTypeNode();
                if (tn && tn.getProperties) props = tn.getProperties();
            }

            return {
                isObject: true,
                properties: props.map((prop) => {
                    const name = prop.getName();
                    const optional = (prop.hasQuestionToken && prop.hasQuestionToken()) || (prop.isOptional && prop.isOptional()) || false;
                    const propTypeNode = prop.getTypeNode();

                    const nested = this.expandTypeRecursively(propTypeNode, sourceFile);
                    if (nested) {
                        return { name, isOptional: optional, ...nested };
                    }

                    return {
                        name,
                        isOptional: optional,
                        type: prop.getType().getText(),
                    };
                }),
            };
        }

        return null;
    }

    getParameterDetails(param, sourceFile) {
        const name = param.getName();
        const isOptional = param.isOptional();
        const typeNode = param.getTypeNode();

        const expanded = this.expandTypeRecursively(typeNode, sourceFile);
        if (expanded) return { name, isOptional, ...expanded };

        return { name, isOptional };
    }

    /**
     * Enumerates modules in the target directory
     * @param {string} targetDir
     */
    getModules(targetDir) {
        if (!fs.existsSync(targetDir)) return {};
        const files = fs.readdirSync(targetDir).filter((f) => f.endsWith(".ts") && f !== "index.ts");
        const modules = {};
        files.forEach(f => {
            const name = f.replace(".ts", "");
            modules[name] = true;
        });
        return modules;
    }
}

module.exports = new ProjectService();
