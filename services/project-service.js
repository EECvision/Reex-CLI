const fs = require("fs");
const path = require("path");
const { Project, SyntaxKind } = require("ts-morph");
const dotenv = require("dotenv");

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

        const files = fs.readdirSync(targetDir).filter((f) => f.endsWith(".ts"));
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
                        const initializer = declaration.getInitializer();
                        if (initializer && initializer.getKind() === SyntaxKind.ObjectLiteralExpression) {
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

                                        // Look for: const url = "/path";
                                        const variableStatements = funcNode.getBody().getDescendantsOfKind(SyntaxKind.VariableStatement);
                                        for (const stmt of variableStatements) {
                                            const decl = stmt.getDeclarations()[0];
                                            if (decl.getName() === "url") {
                                                const init = decl.getInitializer();
                                                if (init) {
                                                    if (init.getKind() === SyntaxKind.StringLiteral || init.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
                                                        url = init.getLiteralValue();
                                                    } else if (init.getKind() === SyntaxKind.TemplateExpression) {
                                                        // Handle `path${query}` -> extract full text including ${}
                                                        // We want the raw source text of the template literal, but usually without the backticks if possible, 
                                                        // or just the text representation. getText() includes backticks.
                                                        url = init.getText().replace(/^`|`$/g, '');
                                                    }
                                                }
                                            }
                                        }

                                        // Look for: handleApiCall(() => CLIENT.method(url), ...)
                                        const callExprs = funcNode.getBody().getDescendantsOfKind(SyntaxKind.CallExpression);
                                        for (const call of callExprs) {
                                            if (call.getExpression().getText() === "handleApiCall") {
                                                // First arg is arrow function: () => CLIENT.method(...)
                                                const firstArg = call.getArguments()[0];
                                                if (firstArg && (firstArg.getKind() === SyntaxKind.ArrowFunction || firstArg.getKind() === SyntaxKind.FunctionExpression)) {
                                                    const innerCall = firstArg.getBody(); // CLIENT.method(url)
                                                    if (innerCall.getKind() === SyntaxKind.CallExpression) {
                                                        const expr = innerCall.getExpression(); // CLIENT.method (PropertyAccessExpression)
                                                        if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
                                                            client = expr.getExpression().getText(); // CLIENT
                                                            method = expr.getName().toUpperCase(); // method (get, post, etc.)
                                                        }
                                                    }
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
    pruneUnusedDefinitions(targetDir) {
        console.log(`[ProjectService] Starting Prune in: ${targetDir}`);
        if (!fs.existsSync(targetDir)) {
            console.log(`[ProjectService] Target dir does not exist: ${targetDir}`);
            return;
        }

        // Re-initialize project to ensure fresh state
        this.project = new Project({
            skipAddingFilesFromTsConfig: true,
        });

        const files = fs.readdirSync(targetDir).filter((f) => f.endsWith(".ts"));
        console.log(`[ProjectService] Found ${files.length} definition files to check.`);

        for (const file of files) {
            const filePath = path.join(targetDir, file);
            const sourceFile = this.project.addSourceFileAtPath(filePath);
            const moduleName = file.replace(".ts", "");

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
                        sourceFile.saveSync();
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
     * @param {string} configDir - Path to src/api-services/config
     */
    getProjectConfig(configDir) {
        if (!fs.existsSync(configDir)) return { baseURL: "http://localhost:3000/api", clients: {}, clientPrefixes: {} };
        const corePath = path.join(configDir, "core.ts");
        const clientsPath = path.join(configDir, "clients.ts");

        const config = { clients: {}, clientPrefixes: {} };
        const project = new Project({ skipAddingFilesFromTsConfig: true });

        const constantsPath = path.join(configDir, "constants.ts");

        // 1. Get BaseURL from constants.ts (preferred) or core.ts (fallback)
        const configSourcePath = fs.existsSync(constantsPath) ? constantsPath : corePath;

        if (fs.existsSync(configSourcePath)) {
            const sourceFile = project.addSourceFileAtPath(configSourcePath);

            // Resolve Env Vars logic (Simplified Copy)
            // Assumes project root is 3 levels up from configDir
            const projectRoot = path.resolve(configDir, "../../../");
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
                if (node.getKind() === SyntaxKind.StringLiteral) return node.getLiteralValue();
                if (node.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) return node.getLiteralText();
                if (node.getKind() === SyntaxKind.PropertyAccessExpression) {
                    const text = node.getText();
                    if (text.startsWith("process.env.")) {
                        const varName = text.replace("process.env.", "");
                        return envConfig[varName] || process.env[varName];
                    }
                }
                if (node.getKind() === SyntaxKind.BinaryExpression) {
                    const operator = node.getOperatorToken().getText();
                    if (operator === "||" || operator === "??") {
                        const leftVal = resolveValue(node.getLeft());
                        if (leftVal) return leftVal;
                        return resolveValue(node.getRight());
                    }
                }
                return undefined;
            };

            const baseURLDecl = sourceFile.getVariableDeclaration("baseURL");
            if (baseURLDecl) {
                const val = resolveValue(baseURLDecl.getInitializer());
                config.baseURL = val || "http://localhost:3000/api";
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
        const metadataPath = path.join(configDir, 'metadata.json');
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
        const files = fs.readdirSync(targetDir).filter((f) => f.endsWith(".ts"));
        const modules = {};
        files.forEach(f => {
            const name = f.replace(".ts", "");
            modules[name] = true;
        });
        return modules;
    }
}

module.exports = new ProjectService();
