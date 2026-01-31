// AI Settings Types
// Defines all types for AI feature configuration, personalization, and privacy

// ============================================================
// FEATURE TOGGLES
// ============================================================

export interface AIFeatureToggles {
  summarization: boolean;
  smartReply: boolean;
  autoReply: AutoReplyMode;
  priorityDetection: boolean;
  spamFiltering: boolean;
  draftAssistant: boolean;
}

export type AutoReplyMode = "off" | "suggest" | "draft" | "auto";

export interface FeatureAvailability {
  feature: keyof AIFeatureToggles;
  available: boolean;
  reason?: string; // Why unavailable (disabled by admin, quota exceeded, etc.)
  quotaUsed?: number;
  quotaLimit?: number;
}

// ============================================================
// PERSONALIZATION
// ============================================================

export interface AIPersonalization {
  tonePreference: TonePreference;
  customInstructions: string;
  languagePreference: string;
  writingStyle: WritingStyle;
  signatureInclusion: boolean;
  formalityLevel: FormalityLevel;
}

export type TonePreference = "professional" | "casual" | "match_sender" | "custom";
export type WritingStyle = "concise" | "detailed" | "balanced";
export type FormalityLevel = "formal" | "neutral" | "informal";

// ============================================================
// PRIVACY CONTROLS
// ============================================================

export interface AIPrivacySettings {
  dataRetentionDays: DataRetentionPeriod;
  allowAnonymousTraining: boolean;
  excludedSenders: string[];
  excludedDomains: string[];
  excludedFolders: string[];
  encryptAIData: boolean;
  logAIAccess: boolean;
  shareContextWithAI: ContextSharingLevel;
}

export type DataRetentionPeriod = 7 | 30 | 90 | 365 | -1; // -1 = indefinite (not recommended)
export type ContextSharingLevel = "minimal" | "standard" | "full";

export interface AIDataDeletionRequest {
  userId: string;
  deleteType: "all" | "history" | "training" | "preferences";
  requestedAt: string;
  completedAt?: string;
  status: "pending" | "processing" | "completed" | "failed";
}

// ============================================================
// ADMIN SETTINGS (ORG-WIDE)
// ============================================================

export interface AdminAISettings {
  orgId: string;
  aiEnabled: boolean;
  llmProvider: LLMProvider;
  llmModel: string;
  tokenLimitPerUser: number;
  tokenLimitPerDay: number;
  requireHumanReview: HumanReviewRequirement;
  complianceMode: ComplianceMode;
  allowedFeatures: Partial<AIFeatureToggles>;
  auditLogging: boolean;
  dataResidency: DataResidency;
  customEndpoint?: string;
  apiKeyConfigured: boolean;
}

export type LLMProvider =
  | "openai"
  | "anthropic"
  | "azure_openai"
  | "google"
  | "self_hosted"
  | "disabled";

export interface LLMProviderConfig {
  provider: LLMProvider;
  name: string;
  description: string;
  models: LLMModel[];
  supportsStreaming: boolean;
  supportsVision: boolean;
  requiresApiKey: boolean;
}

export interface LLMModel {
  id: string;
  name: string;
  contextWindow: number;
  costPer1kTokens: number;
  recommended?: boolean;
}

export type HumanReviewRequirement = "never" | "auto_reply_only" | "external_only" | "always";

export interface ComplianceMode {
  enabled: boolean;
  level: "standard" | "hipaa" | "gdpr" | "sox" | "custom";
  restrictions: ComplianceRestriction[];
}

export type ComplianceRestriction =
  | "no_pii_in_prompts"
  | "no_external_sharing"
  | "audit_all_requests"
  | "redact_sensitive_data"
  | "require_encryption"
  | "no_training_data"
  | "limited_context";

export type DataResidency = "us" | "eu" | "ap" | "custom";

// ============================================================
// COMBINED USER SETTINGS
// ============================================================

export interface UserAISettings {
  userId: string;
  orgId: string;
  features: AIFeatureToggles;
  personalization: AIPersonalization;
  privacy: AIPrivacySettings;
  lastUpdated: string;
  version: number;
}

// ============================================================
// AI STATUS & AVAILABILITY
// ============================================================

export interface AIServiceStatus {
  available: boolean;
  provider: LLMProvider;
  model: string;
  latencyMs?: number;
  quotaRemaining?: number;
  quotaResetAt?: string;
  degradedFeatures?: string[];
  message?: string;
}

export interface AIUsageStats {
  userId: string;
  period: "day" | "week" | "month";
  tokensUsed: number;
  tokenLimit: number;
  requestCount: number;
  featureBreakdown: Record<string, number>;
  costEstimate?: number;
}

// ============================================================
// API REQUEST/RESPONSE TYPES
// ============================================================

export interface UpdateAISettingsRequest {
  features?: Partial<AIFeatureToggles>;
  personalization?: Partial<AIPersonalization>;
  privacy?: Partial<AIPrivacySettings>;
}

export interface UpdateAdminAISettingsRequest {
  aiEnabled?: boolean;
  llmProvider?: LLMProvider;
  llmModel?: string;
  tokenLimitPerUser?: number;
  tokenLimitPerDay?: number;
  requireHumanReview?: HumanReviewRequirement;
  complianceMode?: Partial<ComplianceMode>;
  allowedFeatures?: Partial<AIFeatureToggles>;
  dataResidency?: DataResidency;
}

export interface DeleteAIDataRequest {
  deleteType: AIDataDeletionRequest["deleteType"];
  confirmPhrase: string; // User must type "DELETE" to confirm
}

export interface DeleteAIDataResponse {
  success: boolean;
  deletedItems: number;
  message: string;
}

// ============================================================
// DEFAULT VALUES
// ============================================================

export const DEFAULT_AI_FEATURES: AIFeatureToggles = {
  summarization: true,
  smartReply: true,
  autoReply: "off",
  priorityDetection: true,
  spamFiltering: true,
  draftAssistant: true,
};

export const DEFAULT_AI_PERSONALIZATION: AIPersonalization = {
  tonePreference: "professional",
  customInstructions: "",
  languagePreference: "en",
  writingStyle: "balanced",
  signatureInclusion: true,
  formalityLevel: "neutral",
};

export const DEFAULT_AI_PRIVACY: AIPrivacySettings = {
  dataRetentionDays: 30,
  allowAnonymousTraining: false, // Privacy-preserving default
  excludedSenders: [],
  excludedDomains: [],
  excludedFolders: ["Drafts", "Trash"],
  encryptAIData: true,
  logAIAccess: true,
  shareContextWithAI: "standard",
};

export const DEFAULT_ADMIN_AI_SETTINGS: Omit<AdminAISettings, "orgId"> = {
  aiEnabled: true,
  llmProvider: "openai",
  llmModel: "gpt-4-turbo",
  tokenLimitPerUser: 100000,
  tokenLimitPerDay: 50000,
  requireHumanReview: "auto_reply_only",
  complianceMode: {
    enabled: false,
    level: "standard",
    restrictions: [],
  },
  allowedFeatures: DEFAULT_AI_FEATURES,
  auditLogging: true,
  dataResidency: "us",
  apiKeyConfigured: false,
};

// ============================================================
// LLM PROVIDER CONFIGURATIONS
// ============================================================

export const LLM_PROVIDERS: LLMProviderConfig[] = [
  {
    provider: "openai",
    name: "OpenAI",
    description: "GPT-4 and GPT-3.5 models",
    models: [
      {
        id: "gpt-4-turbo",
        name: "GPT-4 Turbo",
        contextWindow: 128000,
        costPer1kTokens: 0.01,
        recommended: true,
      },
      { id: "gpt-4", name: "GPT-4", contextWindow: 8192, costPer1kTokens: 0.03 },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", contextWindow: 16384, costPer1kTokens: 0.001 },
    ],
    supportsStreaming: true,
    supportsVision: true,
    requiresApiKey: true,
  },
  {
    provider: "anthropic",
    name: "Anthropic",
    description: "Claude models with strong safety",
    models: [
      {
        id: "claude-3-opus",
        name: "Claude 3 Opus",
        contextWindow: 200000,
        costPer1kTokens: 0.015,
        recommended: true,
      },
      {
        id: "claude-3-sonnet",
        name: "Claude 3 Sonnet",
        contextWindow: 200000,
        costPer1kTokens: 0.003,
      },
      {
        id: "claude-3-haiku",
        name: "Claude 3 Haiku",
        contextWindow: 200000,
        costPer1kTokens: 0.00025,
      },
    ],
    supportsStreaming: true,
    supportsVision: true,
    requiresApiKey: true,
  },
  {
    provider: "azure_openai",
    name: "Azure OpenAI",
    description: "Microsoft-hosted OpenAI models",
    models: [
      {
        id: "gpt-4",
        name: "GPT-4 (Azure)",
        contextWindow: 8192,
        costPer1kTokens: 0.03,
        recommended: true,
      },
      {
        id: "gpt-35-turbo",
        name: "GPT-3.5 Turbo (Azure)",
        contextWindow: 16384,
        costPer1kTokens: 0.001,
      },
    ],
    supportsStreaming: true,
    supportsVision: false,
    requiresApiKey: true,
  },
  {
    provider: "google",
    name: "Google AI",
    description: "Gemini models",
    models: [
      {
        id: "gemini-pro",
        name: "Gemini Pro",
        contextWindow: 32000,
        costPer1kTokens: 0.00025,
        recommended: true,
      },
      { id: "gemini-ultra", name: "Gemini Ultra", contextWindow: 32000, costPer1kTokens: 0.007 },
    ],
    supportsStreaming: true,
    supportsVision: true,
    requiresApiKey: true,
  },
  {
    provider: "self_hosted",
    name: "Self-Hosted",
    description: "Your own LLM infrastructure",
    models: [],
    supportsStreaming: true,
    supportsVision: false,
    requiresApiKey: false,
  },
];

// ============================================================
// COMPLIANCE PRESETS
// ============================================================

export const COMPLIANCE_PRESETS: Record<ComplianceMode["level"], ComplianceRestriction[]> = {
  standard: [],
  hipaa: [
    "no_pii_in_prompts",
    "redact_sensitive_data",
    "require_encryption",
    "audit_all_requests",
    "no_training_data",
  ],
  gdpr: ["no_pii_in_prompts", "no_training_data", "audit_all_requests"],
  sox: ["audit_all_requests", "require_encryption"],
  custom: [],
};
