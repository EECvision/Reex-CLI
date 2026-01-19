const fs = require("fs");
const path = require("path");
const { Project, SyntaxKind } = require("ts-morph");

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
                                            moduleExports[methodName] = { args: params, ...metadata };
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
     * Reads the project config to get BaseURLs.
     * @param {string} configDir - Path to src/api-services/config
     */
    getProjectConfig(configDir) {
        if (!fs.existsSync(configDir)) return {};
        const filePath = path.join(configDir, "index.ts");
        if (!fs.existsSync(filePath)) return {};

        const project = new Project({ skipAddingFilesFromTsConfig: true });
        const sourceFile = project.addSourceFileAtPath(filePath);
        const config = { clients: {} };

        // 1. Get baseURL
        // 1. Get baseURL
        const baseURLDecl = sourceFile.getVariableDeclaration("baseURL");
        if (baseURLDecl) {
            const init = baseURLDecl.getInitializer();
            if (init) {
                // Case 1: Simple String Literal
                if (init.getKind() === SyntaxKind.StringLiteral) {
                    config.baseURL = init.getLiteralValue();
                }
                // Case 2: Binary Expression (process.env.FOO || "http://...")
                else if (init.getKind() === SyntaxKind.BinaryExpression) {
                    try {
                        // Attempt to get right side for default
                        const right = init.getRight();
                        if (right.getKind() === SyntaxKind.StringLiteral) {
                            config.baseURL = right.getLiteralValue();
                        }
                    } catch (e) { console.warn("Failed to parse baseURL binary expr", e); }
                }
                // Case 3: Template Literal
                else if (init.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
                    config.baseURL = init.getLiteralValue();
                }
            }
            if (!config.baseURL) {
                config.baseURL = "http://localhost:3000/api"; // Default fallback
            }
        } else {
            config.baseURL = "http://localhost:3000/api";
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
