const fs = require('fs');
const path = require('path');
const projectService = require('./project-service');
const typeService = require('./type-service');
const hookService = require('./hook-service');
const configService = require('./config-service');
const sseService = require('./sse-service');

class GeneratorService {

  /**
   * Regenerates the API project structure:
   * 1. Scaffolds config files (constants, core, utils)
   * 2. Generates Manifest from definitions
   * 3. Generates Hooks
   * 4. Generates Types
   * 5. Prunes unused clients
   * 6. Generates index barrel
   * 
   * @param {string} apiTargetDir 
   */
  regenerate(apiTargetDir) {
    const definitionsDir = path.join(apiTargetDir, 'src', 'api-services', 'definitions');
    const configDir = path.join(apiTargetDir, 'src', 'api-services', 'config');
    const indexTimePath = path.join(configDir, 'index.ts');
    const constantsPath = path.join(configDir, 'constants.ts');
    const corePath = path.join(configDir, 'core.ts');
    const clientsPath = path.join(configDir, 'clients.ts');
    const utilsPath = path.join(configDir, 'utils.ts');

    try {
      console.log("[Generator] Regenerating Manifest & Hooks...");

      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // 1. constants.ts - Managed by Bridge (Base URL)
      if (!fs.existsSync(constantsPath)) {
        const constantsContent = `
export const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.example.com";
`;
        fs.writeFileSync(constantsPath, constantsContent);
        console.log("[Generator] Scaffoled config/constants.ts");
      }

      // 2. core.ts - User Managed (Interceptors), imports constants
      if (!fs.existsSync(corePath)) {
        const coreContent = `
import axios, {
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from "axios";
import { baseURL } from "./constants";

const DEFAULT_CONFIG = {
  baseURL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
};

// 1. Create a factory function to avoid repeating interceptor logic
export const createClient = (path: string = ""): AxiosInstance => {
  const client = axios.create({
    ...DEFAULT_CONFIG,
    baseURL: path ? \`\${baseURL}\${path}\` : baseURL,
  });

  // Request Interceptor: Auth
  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    if (typeof window !== "undefined") {
      // You might pull this from a redux or zustand store or a cookie helper
      const token = localStorage.getItem("token");
      if (token && config.headers) {
        config.headers.Authorization = \`Bearer \${token}\`;
      }
    }
    return config;
  });

  // Response Interceptor: Error Handling
  client.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error: AxiosError) => {
      return Promise.reject(error);
    },
  );

  return client;
};

// 2. Base Client (Core Identity)
export const BASE_CLIENT = createClient();
`;
        fs.writeFileSync(corePath, coreContent);
        console.log("[Generator] Scaffoled config/core.ts");
      }

      // clients.ts - SCAFFOLD ONLY (Generator manages this)
      if (!fs.existsSync(clientsPath)) {
        const clientsContent = `
import { createClient } from "./core";

// Auto-generated clients will be added here
`;
        fs.writeFileSync(clientsPath, clientsContent);
        console.log("[Generator] Scaffoled config/clients.ts");
      }


      // index.ts - BARREL ONLY (Managed by Bridge)
      const indexContent = `
export * from "./core";
export * from "./clients";
export * from "./utils";
`;
      fs.writeFileSync(indexTimePath, indexContent);
      console.log("[Generator] Updated config/index.ts");


      // utils.ts
      if (!fs.existsSync(utilsPath)) {
        const utilsContent = `
import { AxiosResponse, isAxiosError } from "axios";

export interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
  originalError?: unknown; // Optional: useful for debugging
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

/**
 * Standard API Wrapper
 */
export const handleApiCall = async <T>(
  fn: () => Promise<AxiosResponse<T>>,
  label: string,
): Promise<ApiResponse<T>> => {
  try {
    const res = await fn();
    return { data: res.data };
  } catch (err: unknown) {
    return { error: handleError(err, label) };
  }
};

export const handleError = (error: unknown, label: string): ApiError => {
  let message = "An unexpected error occurred";
  let code: string | undefined;
  let statusCode: number | undefined;

  if (isAxiosError(error)) {
    const data = error.response?.data;
    message = data?.message || error.message || message;
    code = data?.code;
    statusCode = error.response?.status;
  } else if (error instanceof Error) {
    message = error.message;
  }

  console.error(\`[API ERROR - \${label}]\`, { message, code, statusCode });
  return { message, code, statusCode };
};

/**
 * Handle query params
 */
export const constructQueryParams = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>,
): string => {
  const params = new URLSearchParams();

  Object.entries(payload).forEach(([k, v]) => {
    if (
      v !== undefined &&
      v !== null &&
      v !== "" &&
      !(Array.isArray(v) && v.length === 0)
    ) {
      params.append(k, String(v));
    }
  });

  const query = params.toString();
  return query ? \`?\${query}\` : "";
};
`;
        fs.writeFileSync(utilsPath, utilsContent);
        console.log("[Generator] Scaffoled config/utils.ts");
      }

      // 2. Generate Manifest
      const manifest = projectService.generateManifest(definitionsDir);

      // 3. Generate Hooks
      hookService.generateHooks(apiTargetDir, manifest);

      // 3b. Generate Types Folder
      typeService.generateTypes(apiTargetDir, manifest);

      // 3c. Sync Clients (Auto-Prune unused clients)
      configService.updateClientsFile(apiTargetDir, {}, { prune: true });

      // 4. Regenerate Barrel File (src/api-services/index.ts)
      const moduleNames = Object.keys(manifest).sort();
      const barrelContent = `export * from "./config";
export * from "./config/utils";

${moduleNames.map((name) => `import { ${name}Api } from "./definitions/${name}";`).join('\n')}

export const apiClient = {
${moduleNames.map((name) => `  ...${name}Api,`).join('\n')}
};
`;
      const barrelPath = path.join(apiTargetDir, 'src', 'api-services', 'index.ts');
      fs.writeFileSync(barrelPath, barrelContent);
      console.log("[Generator] Regenerated src/api-services/index.ts");

      sseService.broadcast(Date.now().toString(), 'project:updated', 'Project generated');
      console.log("[Generator] Regeneration Complete");
      return { success: true, manifestKeys: moduleNames };
    } catch (e) {
      console.error("[Generator] Regeneration Failed:", e);
      throw e;
    }
  }
}

module.exports = new GeneratorService();
