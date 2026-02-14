// ─── Main client ─────────────────────────────────────────────────────────────
export { OonruMail } from "./client.js";

// ─── Errors ──────────────────────────────────────────────────────────────────
export { OonruMailError, OonruMailTimeoutError } from "./errors.js";

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  // Config
  OonruMailConfig,

  // Send
  SendRequest,
  SendResponse,
  BatchSendRequest,
  BatchSendResponse,
  Attachment,
  RejectedRecipient,

  // Templates
  Template,
  TemplateVariable,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  CloneTemplateRequest,
  RenderTemplateResponse,
  PreviewTemplateRequest,
  ListTemplatesParams,
  TemplateListResponse,
  TemplateVersion,
  TemplateVersionListResponse,

  // Webhooks
  Webhook,
  WebhookEventType,
  CreateWebhookRequest,
  UpdateWebhookRequest,
  TestWebhookResponse,
  RotateSecretResponse,
  RetryPolicy,
  WebhookDelivery,
  WebhookDeliveryListResponse,
  ListWebhookDeliveriesParams,
  WebhookListResponse,
  WebhookPayload,

  // Suppressions
  Suppression,
  SuppressionReason,
  BounceClass,
  CreateSuppressionRequest,
  BulkSuppressionRequest,
  BulkSuppressionResponse,
  CheckSuppressionResponse,
  SuppressionCheckResult,
  SuppressionStats,
  ListSuppressionsParams,
  SuppressionListResponse,

  // Messages
  Message,
  MessageTimeline,
  MessageTimelineEvent,
  ListMessagesParams,
  MessageListResponse,

  // Events
  EmailEvent,
  ListEventsParams,
  EventListResponse,

  // Analytics
  OverviewStats,
  TimeSeriesStats,
  TimeSeriesPoint,
  BounceStats,
  CategoryStats,
  DomainStats,
  GeoStats,
  DeviceStats,
  LinkStats,
  EngagementStats,
  RealTimeStats,
  ComparisonStats,
  ReputationStats,
  DateRangeParams,
  TimeSeriesParams,
  TopParams,

  // API Keys
  ApiKey,
  ApiKeyScope,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  UpdateApiKeyRequest,
  ApiKeyUsage,
  ApiKeyUsageResponse,
  ListApiKeysParams,
  ApiKeyListResponse,

  // Unsubscribe Groups
  UnsubscribeGroup,
  CreateUnsubscribeGroupRequest,
  UnsubscribeGroupListResponse,

  // Common
  PaginationParams,
  PaginatedResponse,
  ApiErrorBody,
} from "./types.js";
