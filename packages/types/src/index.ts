/**
 * @email/types
 * Shared TypeScript types for Enterprise Email
 */

// Admin domain types
export * from "./admin-domain.js";

// Email types
export {
  EmailStatus,
  EmailPriority,
  EmailFolder,
  emailAddressSchema,
  sendEmailRequestSchema,
  type Email,
  type EmailAddress,
  type EmailAttachment,
  type EmailHeader,
  type EmailTrackingEvent,
  type SendEmailRequest,
  type SendEmailResponse,
  type EmailListParams,
  type EmailTemplate,
} from "./email.js";

// User types
export {
  UserRole,
  UserStatus,
  TwoFactorMethod,
  userProfileSchema,
  createUserRequestSchema,
  authenticateRequestSchema,
  type User,
  type UserProfile,
  type UserPreferences,
  type TwoFactorSettings,
  type UserSecuritySettings,
  type CreateUserRequest,
  type UpdateUserRequest,
  type AuthenticateRequest,
  type AuthenticateResponse,
  type UserSession,
  type UserListParams,
} from "./user.js";

// Domain & Organization types
export {
  OrganizationStatus,
  OrganizationPlan,
  createOrganizationRequestSchema,
  createDomainRequestSchema,
  type Organization,
  type OrganizationBilling,
  type OrganizationQuotas,
  type OrganizationSettings,
  type CreateOrganizationRequest,
  type UpdateOrganizationRequest,
  type CreateDomainRequest,
  type DomainVerificationStatus,
  type OrganizationListParams,
  type DomainListParams,
} from "./domain.js";

// Re-export domain types from config
export {
  DomainStatus,
  VerificationType,
  type DomainConfig,
  type DkimConfig,
  type DnsRecord,
  type SpfConfig,
  type DmarcConfig,
} from "./domain.js";

// API types
export {
  WebhookEventType,
  paginationParamsSchema,
  sortParamsSchema,
  filterConditionSchema,
  createSuccessResponse,
  createErrorResponse,
  createPaginatedResponse,
  type ApiResponse,
  type ApiError,
  type ApiMeta,
  type PaginationParams,
  type PaginationMeta,
  type PaginatedResponse,
  type SortParams,
  type FilterOperator,
  type FilterCondition,
  type RequestContext,
  type HealthCheckResponse,
  type ServiceHealth,
  type WebhookEvent,
  type RateLimitInfo,
} from "./api.js";

// AI Settings types
export * from "./ai-settings.js";
