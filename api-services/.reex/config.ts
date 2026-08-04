// @internal — No changes needed
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Enforces the basic structure of Reex definition files.
 * Use with the `satisfies` operator for maximum IntelliSense:
 * export const myApi = { ... } satisfies ReexDefinition;
 */
export type ReexDefinition = Record<string, (...args: any[]) => Promise<any>>;

/**
 * Enforces the structure of the Reex configuration file (api.config.ts).
 * Use with the `satisfies` operator for maximum IntelliSense.
 */
export interface ReexConfig {
  baseURL: string;
  unwrapResponseData: boolean;
  enableApiLogging: boolean;
  auth: {
    refreshEndpoint: string;
    accessTokenKey: string;
    refreshTokenKey: string;
    extractTokens: (responseBody: any) => { accessToken?: string; refreshToken?: string };
    refreshWithCookie: () => Promise<import("axios").AxiosResponse<any>>;
    refreshWithToken: (storedRefreshToken: string) => Promise<import("axios").AxiosResponse<any>>;
  };
}
