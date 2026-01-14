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

                                    // Expand args
                                    if (init && (init.getKind() === SyntaxKind.ArrowFunction || init.getKind() === SyntaxKind.FunctionExpression)) {
                                        const params = init.getParameters().map(p => this.getParameterDetails(p, sourceFile));

                                        // Attempt to extract client/url from body?
                                        // For now, in "Dumb CLI" mode, we might just need the method names.
                                        moduleExports[methodName] = { args: params };
                                        count++;
                                    }
                                }
                            }
                        }
                    }
                }
            }

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
                    // We try to find the string literal fallback
                    const right = init.getRight();
                    if (right.getKind() === SyntaxKind.StringLiteral) {
                        config.baseURL = right.getLiteralValue();
                    } else {
                        // If it's something else, maybe check left? unlikely for env || default
                        config.baseURL = "http://localhost:3000/api"; // Sensible default if we can't parse
                    }
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

    getParameterDetails(param, sourceFile) {
        const name = param.getName();
        const isOptional = param.isOptional();
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
