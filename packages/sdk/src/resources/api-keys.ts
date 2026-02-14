import type { HttpClient } from "../http.js";
import type {
  ApiKey,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  UpdateApiKeyRequest,
  ApiKeyUsageResponse,
  ListApiKeysParams,
  ApiKeyListResponse,
} from "../types.js";

/**
 * Manage API keys (requires `admin` scope).
 *
 * @example
 * ```ts
 * const { key, api_key } = await mail.apiKeys.create({
 *   domain_id: "uuid",
 *   name: "Platform X Production",
 *   scopes: ["send", "read", "templates"],
 *   rate_limit: 500,
 *   daily_limit: 10000,
 * });
 * // Save `key` — it's only shown once
 * ```
 */
export class ApiKeysResource {
  constructor(private readonly http: HttpClient) {}

  /** List API keys. */
  async list(params?: ListApiKeysParams): Promise<ApiKeyListResponse> {
    return this.http.get<ApiKeyListResponse>("/api-keys", params as Record<string, unknown>);
  }

  /** Get a single API key by ID. */
  async get(id: string): Promise<ApiKey> {
    return this.http.get<ApiKey>(`/api-keys/${id}`);
  }

  /** Create a new API key. The plain key is returned ONLY on creation. */
  async create(data: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    return this.http.post<CreateApiKeyResponse>("/api-keys", data);
  }

  /** Update an API key (name, scopes, limits). */
  async update(id: string, data: UpdateApiKeyRequest): Promise<ApiKey> {
    return this.http.put<ApiKey>(`/api-keys/${id}`, data);
  }

  /** Revoke an API key. */
  async revoke(id: string): Promise<void> {
    return this.http.delete(`/api-keys/${id}`);
  }

  /** Rotate an API key — revokes the old one and returns a new key. */
  async rotate(id: string): Promise<CreateApiKeyResponse> {
    return this.http.post<CreateApiKeyResponse>(`/api-keys/${id}/rotate`);
  }

  /** Get usage statistics for an API key. */
  async usage(id: string, days?: number): Promise<ApiKeyUsageResponse> {
    return this.http.get<ApiKeyUsageResponse>(`/api-keys/${id}/usage`, {
      days: days ?? 30,
    });
  }
}
