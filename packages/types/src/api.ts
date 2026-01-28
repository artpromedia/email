import { z } from "zod";

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

/**
 * API error structure
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
  timestamp: string;
  requestId?: string;
}

/**
 * API metadata for responses
 */
export interface ApiMeta {
  requestId: string;
  timestamp: string;
  duration?: number;
  version?: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  cursor?: string;
}

/**
 * Pagination response metadata
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextCursor?: string;
  previousCursor?: string;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: PaginationMeta;
  meta?: ApiMeta;
}

/**
 * Sort parameters
 */
export interface SortParams {
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/**
 * Filter operator
 */
export type FilterOperator = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "nin" | "like" | "ilike";

/**
 * Filter condition
 */
export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

/**
 * API request context
 */
export interface RequestContext {
  requestId: string;
  userId?: string;
  organizationId?: string;
  domain?: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  timestamp: string;
  uptime: number;
  checks: {
    database: ServiceHealth;
    redis: ServiceHealth;
    search: ServiceHealth;
    storage: ServiceHealth;
    email: ServiceHealth;
  };
}

/**
 * Service health status
 */
export interface ServiceHealth {
  status: "up" | "down" | "degraded";
  latency?: number;
  message?: string;
  lastChecked: string;
}

/**
 * Webhook event
 */
export interface WebhookEvent<T = unknown> {
  id: string;
  type: string;
  timestamp: string;
  data: T;
  organizationId: string;
  domain?: string;
  signature: string;
}

/**
 * Webhook event types
 */
export const WebhookEventType = {
  EMAIL_SENT: "email.sent",
  EMAIL_DELIVERED: "email.delivered",
  EMAIL_BOUNCED: "email.bounced",
  EMAIL_OPENED: "email.opened",
  EMAIL_CLICKED: "email.clicked",
  EMAIL_COMPLAINED: "email.complained",
  DOMAIN_VERIFIED: "domain.verified",
  DOMAIN_FAILED: "domain.failed",
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_DELETED: "user.deleted",
} as const;

export type WebhookEventType = (typeof WebhookEventType)[keyof typeof WebhookEventType];

/**
 * Rate limit info
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

/**
 * Zod schemas
 */
export const paginationParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().optional(),
});

export const sortParamsSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const filterConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(["eq", "ne", "gt", "gte", "lt", "lte", "in", "nin", "like", "ilike"]),
  value: z.unknown(),
});

/**
 * Create success response helper
 */
export function createSuccessResponse<T>(
  data: T,
  meta?: Partial<ApiMeta>
): ApiResponse<T> {
  return {
    success: true,
    data,
    meta: {
      requestId: meta?.requestId ?? crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

/**
 * Create error response helper
 */
export function createErrorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  meta?: Partial<ApiMeta>
): ApiResponse<never> {
  const error: ApiError = {
    code,
    message,
    timestamp: new Date().toISOString(),
  };

  if (details !== undefined) {
    error.details = details;
  }

  if (meta?.requestId !== undefined) {
    error.requestId = meta.requestId;
  }

  return {
    success: false,
    error,
    meta: {
      requestId: meta?.requestId ?? crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

/**
 * Create paginated response helper
 */
export function createPaginatedResponse<T>(
  data: T[],
  pagination: PaginationMeta,
  meta?: Partial<ApiMeta>
): PaginatedResponse<T> {
  return {
    success: true,
    data,
    pagination,
    meta: {
      requestId: meta?.requestId ?? crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}
