/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiClient, type ReexDefinition } from "../core";
import { type get_list__TypeName__s } from "../types/__ModuleName__/get_list__TypeName__s";
import { type get___ModuleNameSingular__Detail } from "../types/__ModuleName__/get___ModuleNameSingular__Detail";
import { type post_create__TypeName__ } from "../types/__ModuleName__/post_create__TypeName__";
import { type put_update__TypeName__ } from "../types/__ModuleName__/put_update__TypeName__";

// --- Types ---

interface Get__TypeName__sParams {
  search?: string;
  page?: number;
  limit?: number;
}

interface Create__TypeName__Payload {
  name: string;
  description?: string;
}

interface Update__TypeName__Params {
  id: string;
  payload: Partial<Create__TypeName__Payload>;
}

// --- API Definition --- 

export const __ModuleName__Api = {
  get_list__TypeName__s: (
    params: Get__TypeName__sParams
  ): Promise<get_list__TypeName__s> =>
    apiClient.get('/path/to/__ModuleName__', { params }),

  get___ModuleNameSingular__Detail: (id: string): Promise<get___ModuleNameSingular__Detail> =>
    apiClient.get(`/path/to/__ModuleName__/${id}`),

  post_create__TypeName__: (
    payload: Create__TypeName__Payload
  ): Promise<post_create__TypeName__> =>
    apiClient.post('/path/to/__ModuleName__', payload),

  put_update__TypeName__: ({
    id,
    payload,
  }: Update__TypeName__Params): Promise<put_update__TypeName__> =>
    apiClient.put(`/path/to/__ModuleName__/${id}`, payload),

  delete_remove__TypeName__: (id: string): Promise<any> =>
    apiClient.delete(`/path/to/__ModuleName__/${id}`),

  // --- Example: Functions with multiple parameters must wrap them in an object ---
  // ❌ INVALID: post_pay: (id: string, amount: number): Promise<any> =>
  //   apiClient.post(`/path/to/__ModuleName__/${id}/pay`, { amount }),
  //
  // ✅ VALID:
  // post_pay: ({ id, amount } : { id: string, amount: number }): Promise<any> =>
  //   apiClient.post(`/path/to/__ModuleName__/${id}/pay`, { amount }),

} satisfies ReexDefinition;
