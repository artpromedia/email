"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Brain,
  Building2,
  ShieldAlert,
  Key,
  Server,
  Users,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Settings,
  DollarSign,
  Activity,
  FileCheck,
  Eye,
  Zap,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ============================================================
// TYPES
// ============================================================

type LLMProvider = "openai" | "anthropic" | "azure" | "google" | "self_hosted";
type ComplianceLevel = "standard" | "hipaa" | "gdpr" | "sox" | "custom";

interface AdminAISettings {
  aiEnabled: boolean;
  llmProvider: LLMProvider;
  llmModel: string;
  apiEndpoint?: string;
  tokenLimitPerUser: number;
  tokenLimitPerDay: number;
  requireHumanReview: boolean;
  humanReviewThreshold: number; // Confidence below this requires review
  complianceMode: ComplianceLevel;
  customRestrictions: string[];
  allowedFeatures: {
    summarization: boolean;
    smartReply: boolean;
    autoReply: boolean;
    priorityDetection: boolean;
    spamFiltering: boolean;
    draftAssistant: boolean;
  };
  auditLogging: boolean;
  dataResidency: string;
  encryptionRequired: boolean;
}

interface LLMProviderConfig {
  id: LLMProvider;
  name: string;
  description: string;
  models: { id: string; name: string; contextLength: number }[];
  requiresApiKey: boolean;
  supportsCustomEndpoint: boolean;
}

interface OrgAIUsage {
  totalTokensUsed: number;
  totalTokenLimit: number;
  activeUsers: number;
  requestsToday: number;
  costEstimate: number;
  featureBreakdown: Record<string, number>;
}

interface AuditLogEntry {
  timestamp: string;
  userId: string;
  userEmail: string;
  feature: string;
  action: string;
  tokensUsed: number;
}

// ============================================================
// CONSTANTS
// ============================================================

const LLM_PROVIDERS: LLMProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4 and GPT-3.5 models",
    models: [
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", contextLength: 128000 },
      { id: "gpt-4", name: "GPT-4", contextLength: 8192 },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", contextLength: 16385 },
    ],
    requiresApiKey: true,
    supportsCustomEndpoint: false,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude 3 models",
    models: [
      { id: "claude-3-opus", name: "Claude 3 Opus", contextLength: 200000 },
      { id: "claude-3-sonnet", name: "Claude 3 Sonnet", contextLength: 200000 },
      { id: "claude-3-haiku", name: "Claude 3 Haiku", contextLength: 200000 },
    ],
    requiresApiKey: true,
    supportsCustomEndpoint: false,
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    description: "Microsoft Azure-hosted OpenAI models",
    models: [
      { id: "gpt-4", name: "GPT-4 (Azure)", contextLength: 8192 },
      { id: "gpt-35-turbo", name: "GPT-3.5 Turbo (Azure)", contextLength: 16385 },
    ],
    requiresApiKey: true,
    supportsCustomEndpoint: true,
  },
  {
    id: "google",
    name: "Google AI",
    description: "Gemini models",
    models: [
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", contextLength: 1000000 },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", contextLength: 1000000 },
    ],
    requiresApiKey: true,
    supportsCustomEndpoint: false,
  },
  {
    id: "self_hosted",
    name: "Self-Hosted",
    description: "Custom LLM deployment (Ollama, vLLM, etc.)",
    models: [{ id: "custom", name: "Custom Model", contextLength: 0 }],
    requiresApiKey: false,
    supportsCustomEndpoint: true,
  },
];

const COMPLIANCE_PRESETS: Record<
  ComplianceLevel,
  { name: string; description: string; restrictions: string[] }
> = {
  standard: {
    name: "Standard",
    description: "Default security settings",
    restrictions: [],
  },
  hipaa: {
    name: "HIPAA",
    description: "Healthcare data compliance",
    restrictions: [
      "No PHI in AI prompts",
      "Audit logging required",
      "Data encryption at rest",
      "Access controls enforced",
    ],
  },
  gdpr: {
    name: "GDPR",
    description: "EU data protection compliance",
    restrictions: [
      "EU data residency",
      "Right to erasure",
      "Consent required for processing",
      "Data minimization",
    ],
  },
  sox: {
    name: "SOX",
    description: "Financial data compliance",
    restrictions: [
      "Financial data restrictions",
      "Audit trail required",
      "Access logging",
      "Segregation of duties",
    ],
  },
  custom: {
    name: "Custom",
    description: "Define your own restrictions",
    restrictions: [],
  },
};

const DATA_RESIDENCY_OPTIONS = [
  { value: "us", label: "United States" },
  { value: "eu", label: "European Union" },
  { value: "uk", label: "United Kingdom" },
  { value: "ap", label: "Asia Pacific" },
  { value: "any", label: "Any Region" },
];

// ============================================================
// MAIN COMPONENT
// ============================================================

interface AdminAISettingsPageProps {
  orgId: string;
}

export function AdminAISettingsPage({ orgId }: AdminAISettingsPageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeSection, setActiveSection] = useState("general");

  const [settings, setSettings] = useState<AdminAISettings>({
    aiEnabled: true,
    llmProvider: "openai",
    llmModel: "gpt-4-turbo",
    tokenLimitPerUser: 100000,
    tokenLimitPerDay: 1000000,
    requireHumanReview: false,
    humanReviewThreshold: 70,
    complianceMode: "standard",
    customRestrictions: [],
    allowedFeatures: {
      summarization: true,
      smartReply: true,
      autoReply: false,
      priorityDetection: true,
      spamFiltering: true,
      draftAssistant: true,
    },
    auditLogging: true,
    dataResidency: "us",
    encryptionRequired: true,
  });

  const [usage, setUsage] = useState<OrgAIUsage | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);

  // Load settings
  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const [settingsRes, usageRes, logsRes, keyRes] = await Promise.all([
        fetch(`/api/v1/admin/ai/settings/${orgId}`),
        fetch(`/api/v1/admin/ai/usage/${orgId}`),
        fetch(`/api/v1/admin/ai/audit-logs/${orgId}?limit=10`),
        fetch(`/api/v1/admin/ai/api-key-status/${orgId}`),
      ]);

      if (settingsRes.ok) {
        const data = (await settingsRes.json()) as AdminAISettings;
        setSettings(data);
      }

      if (usageRes.ok) {
        const usageData = (await usageRes.json()) as OrgAIUsage;
        setUsage(usageData);
      }

      if (logsRes.ok) {
        const logsData = (await logsRes.json()) as { logs: AuditLogEntry[] };
        setAuditLogs(logsData.logs);
      }

      if (keyRes.ok) {
        const keyData = (await keyRes.json()) as { configured: boolean };
        setApiKeyConfigured(keyData.configured);
      }
    } catch (error) {
      console.error("Failed to load admin AI settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Save settings
  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/v1/admin/ai/settings/${orgId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        setHasChanges(false);
      }
    } catch (error) {
      console.error("Failed to save admin AI settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSettings = (updates: Partial<AdminAISettings>) => {
    setSettings((prev) => {
      // Handle apiEndpoint clearing - empty string means remove the property
      if ("apiEndpoint" in updates && updates.apiEndpoint === "") {
        const { apiEndpoint: _, ...rest } = prev;
        return rest as AdminAISettings;
      }
      return { ...prev, ...updates };
    });
    setHasChanges(true);
  };

  const updateAllowedFeatures = (
    feature: keyof AdminAISettings["allowedFeatures"],
    enabled: boolean
  ) => {
    setSettings((prev) => ({
      ...prev,
      allowedFeatures: { ...prev.allowedFeatures, [feature]: enabled },
    }));
    setHasChanges(true);
  };

  const selectedProvider = LLM_PROVIDERS.find((p) => p.id === settings.llmProvider);

  if (isLoading) {
    return <AdminAISettingsSkeleton />;
  }

  return (
    <TooltipProvider>
      <div className="container max-w-5xl space-y-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-100 p-2 dark:bg-violet-900">
                <Building2 className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Organization AI Settings</h1>
                <p className="text-muted-foreground">
                  Configure AI capabilities and restrictions for your organization
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Badge variant="outline" className="text-amber-600">
                Unsaved changes
              </Badge>
            )}
            <Button onClick={saveSettings} disabled={!hasChanges || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Usage Overview */}
        {usage && <UsageOverview usage={usage} />}

        {/* Main Content */}
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          {/* Navigation */}
          <nav className="space-y-1">
            {[
              { id: "general", label: "General", icon: Settings },
              { id: "provider", label: "LLM Provider", icon: Brain },
              { id: "features", label: "Features", icon: Zap },
              { id: "limits", label: "Limits", icon: Activity },
              { id: "compliance", label: "Compliance", icon: ShieldAlert },
              { id: "audit", label: "Audit Logs", icon: FileCheck },
            ].map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  activeSection === section.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                <section.icon className="h-4 w-4" />
                {section.label}
              </button>
            ))}
          </nav>

          {/* Settings Content */}
          <div className="space-y-6">
            {activeSection === "general" && (
              <GeneralSection settings={settings} onChange={updateSettings} />
            )}

            {activeSection === "provider" && (
              <ProviderSection
                settings={settings}
                selectedProvider={selectedProvider}
                apiKeyConfigured={apiKeyConfigured}
                orgId={orgId}
                onChange={updateSettings}
              />
            )}

            {activeSection === "features" && (
              <FeaturesSection
                allowedFeatures={settings.allowedFeatures}
                aiEnabled={settings.aiEnabled}
                onChange={updateAllowedFeatures}
              />
            )}

            {activeSection === "limits" && (
              <LimitsSection settings={settings} onChange={updateSettings} />
            )}

            {activeSection === "compliance" && (
              <ComplianceSection settings={settings} onChange={updateSettings} />
            )}

            {activeSection === "audit" && (
              <AuditLogsSection
                logs={auditLogs}
                auditLoggingEnabled={settings.auditLogging}
                onToggleAuditLogging={(enabled) => updateSettings({ auditLogging: enabled })}
              />
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ============================================================
// USAGE OVERVIEW
// ============================================================

function UsageOverview({ usage }: { usage: OrgAIUsage }) {
  const usagePercent = (usage.totalTokensUsed / usage.totalTokenLimit) * 100;

  return (
    <Card>
      <CardContent className="grid gap-4 py-4 sm:grid-cols-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Token Usage</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">
              {(usage.totalTokensUsed / 1000000).toFixed(2)}M
            </span>
            <span className="text-sm text-muted-foreground">
              / {(usage.totalTokenLimit / 1000000).toFixed(0)}M
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                usagePercent > 90
                  ? "bg-destructive"
                  : usagePercent > 70
                    ? "bg-amber-500"
                    : "bg-primary"
              )}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Active Users</p>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <span className="text-2xl font-bold">{usage.activeUsers}</span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Requests Today</p>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <span className="text-2xl font-bold">{usage.requestsToday.toLocaleString()}</span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Est. Monthly Cost</p>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <span className="text-2xl font-bold">${usage.costEstimate.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// GENERAL SECTION
// ============================================================

function GeneralSection({
  settings,
  onChange,
}: {
  settings: AdminAISettings;
  onChange: (updates: Partial<AdminAISettings>) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>General Settings</CardTitle>
        <CardDescription>
          Control whether AI features are available to your organization
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "rounded-full p-2",
                settings.aiEnabled ? "bg-green-100 dark:bg-green-900" : "bg-muted"
              )}
            >
              <Brain
                className={cn(
                  "h-5 w-5",
                  settings.aiEnabled
                    ? "text-green-600 dark:text-green-400"
                    : "text-muted-foreground"
                )}
              />
            </div>
            <div>
              <Label htmlFor="ai-enabled" className="text-base font-medium">
                Enable AI Features
              </Label>
              <p className="text-sm text-muted-foreground">
                When disabled, all AI features will be unavailable to all users
              </p>
            </div>
          </div>
          <Switch
            id="ai-enabled"
            checked={settings.aiEnabled}
            onCheckedChange={(checked: boolean) => onChange({ aiEnabled: checked })}
          />
        </div>

        {!settings.aiEnabled && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  AI features are disabled
                </p>
                <p className="text-amber-700 dark:text-amber-300">
                  Users will not have access to any AI-powered features including summarization,
                  smart replies, and spam filtering.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <Label htmlFor="encryption">Require Data Encryption</Label>
            <p className="text-sm text-muted-foreground">
              All AI-related data must be encrypted at rest
            </p>
          </div>
          <Switch
            id="encryption"
            checked={settings.encryptionRequired}
            onCheckedChange={(checked: boolean) => onChange({ encryptionRequired: checked })}
          />
        </div>

        <div className="space-y-3">
          <Label>Data Residency</Label>
          <Select
            value={settings.dataResidency}
            onValueChange={(value: string) => onChange({ dataResidency: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATA_RESIDENCY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Restrict where AI data can be processed and stored
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// PROVIDER SECTION
// ============================================================

function ProviderSection({
  settings,
  selectedProvider,
  apiKeyConfigured,
  orgId,
  onChange,
}: {
  settings: AdminAISettings;
  selectedProvider: LLMProviderConfig | undefined;
  apiKeyConfigured: boolean;
  orgId: string;
  onChange: (updates: Partial<AdminAISettings>) => void;
}) {
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [isSavingKey, setIsSavingKey] = useState(false);

  const handleSaveApiKey = async () => {
    if (!newApiKey.trim()) return;

    setIsSavingKey(true);
    try {
      await fetch(`/api/v1/admin/ai/api-key/${orgId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: settings.llmProvider, apiKey: newApiKey }),
      });
      setShowApiKeyDialog(false);
      setNewApiKey("");
      // Refresh to show new status
      window.location.reload();
    } catch (error) {
      console.error("Failed to save API key:", error);
    } finally {
      setIsSavingKey(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>LLM Provider</CardTitle>
          <CardDescription>
            Select and configure the language model provider for AI features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Provider Selection */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LLM_PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                onClick={() => {
                  const defaultModel = provider.models[0];
                  if (defaultModel) {
                    onChange({ llmProvider: provider.id, llmModel: defaultModel.id });
                  }
                }}
                className={cn(
                  "rounded-lg border p-4 text-left transition-colors",
                  settings.llmProvider === provider.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  <span className="font-medium">{provider.name}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{provider.description}</p>
              </button>
            ))}
          </div>

          {/* Model Selection */}
          {selectedProvider && (
            <div className="space-y-3">
              <Label>Model</Label>
              <Select
                value={settings.llmModel}
                onValueChange={(value: string) => onChange({ llmModel: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectedProvider.models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex items-center justify-between gap-4">
                        <span>{model.name}</span>
                        {model.contextLength > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {(model.contextLength / 1000).toFixed(0)}K context
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Custom Endpoint */}
          {selectedProvider?.supportsCustomEndpoint && (
            <div className="space-y-3">
              <Label>API Endpoint</Label>
              <Input
                placeholder="https://your-endpoint.com/v1"
                value={settings.apiEndpoint ?? ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const value = e.target.value.trim();
                  // Pass empty string to signal clearing, non-empty for actual value
                  onChange({ apiEndpoint: value || "" });
                }}
              />
              <p className="text-xs text-muted-foreground">
                Custom endpoint URL for Azure or self-hosted deployments
              </p>
            </div>
          )}

          {/* API Key Configuration */}
          {selectedProvider?.requiresApiKey && (
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "rounded-full p-2",
                      apiKeyConfigured
                        ? "bg-green-100 dark:bg-green-900"
                        : "bg-amber-100 dark:bg-amber-900"
                    )}
                  >
                    <Key
                      className={cn(
                        "h-4 w-4",
                        apiKeyConfigured
                          ? "text-green-600 dark:text-green-400"
                          : "text-amber-600 dark:text-amber-400"
                      )}
                    />
                  </div>
                  <div>
                    <p className="font-medium">
                      {apiKeyConfigured ? "API Key Configured" : "API Key Required"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {apiKeyConfigured
                        ? "Your API key is securely stored"
                        : "Configure your API key to enable AI features"}
                    </p>
                  </div>
                </div>
                <AlertDialog open={showApiKeyDialog} onOpenChange={setShowApiKeyDialog}>
                  <AlertDialogTrigger asChild>
                    <Button variant={apiKeyConfigured ? "outline" : "default"} size="sm">
                      {apiKeyConfigured ? "Update Key" : "Configure"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Configure {selectedProvider.name} API Key</AlertDialogTitle>
                      <AlertDialogDescription>
                        Enter your API key for {selectedProvider.name}. This key will be encrypted
                        and stored securely.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="api-key">API Key</Label>
                        <Input
                          id="api-key"
                          type="password"
                          placeholder="sk-..."
                          value={newApiKey}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setNewApiKey(e.target.value)
                          }
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Your API key is encrypted and never exposed. Only administrators can update
                        this setting.
                      </p>
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setNewApiKey("")}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleSaveApiKey}
                        disabled={!newApiKey.trim() || isSavingKey}
                      >
                        {isSavingKey ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Save API Key"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// FEATURES SECTION
// ============================================================

function FeaturesSection({
  allowedFeatures,
  aiEnabled,
  onChange,
}: {
  allowedFeatures: AdminAISettings["allowedFeatures"];
  aiEnabled: boolean;
  onChange: (feature: keyof AdminAISettings["allowedFeatures"], enabled: boolean) => void;
}) {
  const features = [
    {
      key: "summarization" as const,
      title: "Email Summarization",
      description: "Allow users to generate AI summaries of emails",
      risk: "low",
    },
    {
      key: "smartReply" as const,
      title: "Smart Reply",
      description: "Allow AI-suggested replies",
      risk: "low",
    },
    {
      key: "autoReply" as const,
      title: "Auto-Reply",
      description: "Allow AI to send emails automatically",
      risk: "high",
    },
    {
      key: "priorityDetection" as const,
      title: "Priority Detection",
      description: "Allow AI to detect email priority",
      risk: "low",
    },
    {
      key: "spamFiltering" as const,
      title: "AI Spam Filtering",
      description: "Allow AI-enhanced spam detection",
      risk: "low",
    },
    {
      key: "draftAssistant" as const,
      title: "Draft Assistant",
      description: "Allow AI to help improve drafts",
      risk: "medium",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allowed Features</CardTitle>
        <CardDescription>
          Control which AI features are available to users in your organization
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {features.map((feature) => (
          <div
            key={feature.key}
            className={cn(
              "flex items-center justify-between rounded-lg border p-4",
              !aiEnabled && "opacity-50"
            )}
          >
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={feature.key}>{feature.title}</Label>
                  {feature.risk === "high" && (
                    <Badge variant="destructive" className="text-xs">
                      High Risk
                    </Badge>
                  )}
                  {feature.risk === "medium" && (
                    <Badge variant="outline" className="text-xs text-amber-600">
                      Medium Risk
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            </div>
            <Switch
              id={feature.key}
              checked={allowedFeatures[feature.key]}
              onCheckedChange={(checked: boolean) => onChange(feature.key, checked)}
              disabled={!aiEnabled}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ============================================================
// LIMITS SECTION
// ============================================================

function LimitsSection({
  settings,
  onChange,
}: {
  settings: AdminAISettings;
  onChange: (updates: Partial<AdminAISettings>) => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Token Limits</CardTitle>
          <CardDescription>
            Set limits on AI usage to control costs and prevent abuse
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Per-User Monthly Limit</Label>
              <span className="text-sm font-medium">
                {(settings.tokenLimitPerUser / 1000).toLocaleString()}K tokens
              </span>
            </div>
            <Slider
              value={[settings.tokenLimitPerUser]}
              onValueChange={(values: number[]) => {
                const value = values[0];
                if (value !== undefined) onChange({ tokenLimitPerUser: value });
              }}
              min={10000}
              max={1000000}
              step={10000}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>10K</span>
              <span>1M</span>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Organization Daily Limit</Label>
              <span className="text-sm font-medium">
                {(settings.tokenLimitPerDay / 1000000).toLocaleString()}M tokens
              </span>
            </div>
            <Slider
              value={[settings.tokenLimitPerDay]}
              onValueChange={(values: number[]) => {
                const value = values[0];
                if (value !== undefined) onChange({ tokenLimitPerDay: value });
              }}
              min={100000}
              max={10000000}
              step={100000}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>100K</span>
              <span>10M</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Human Review</CardTitle>
          <CardDescription>Require human review for AI actions with low confidence</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label htmlFor="human-review">Require Human Review</Label>
              <p className="text-sm text-muted-foreground">
                AI-generated responses below confidence threshold need approval
              </p>
            </div>
            <Switch
              id="human-review"
              checked={settings.requireHumanReview}
              onCheckedChange={(checked: boolean) => onChange({ requireHumanReview: checked })}
            />
          </div>

          {settings.requireHumanReview && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Confidence Threshold</Label>
                <span className="text-sm font-medium">{settings.humanReviewThreshold}%</span>
              </div>
              <Slider
                value={[settings.humanReviewThreshold]}
                onValueChange={(values: number[]) => {
                  const value = values[0];
                  if (value !== undefined) onChange({ humanReviewThreshold: value });
                }}
                min={50}
                max={95}
                step={5}
              />
              <p className="text-xs text-muted-foreground">
                AI responses with confidence below {settings.humanReviewThreshold}% will require
                manual approval before sending
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// COMPLIANCE SECTION
// ============================================================

function ComplianceSection({
  settings,
  onChange,
}: {
  settings: AdminAISettings;
  onChange: (updates: Partial<AdminAISettings>) => void;
}) {
  const [newRestriction, setNewRestriction] = useState("");

  const addCustomRestriction = () => {
    if (!newRestriction.trim()) return;
    if (!settings.customRestrictions.includes(newRestriction)) {
      onChange({ customRestrictions: [...settings.customRestrictions, newRestriction] });
    }
    setNewRestriction("");
  };

  const removeCustomRestriction = (restriction: string) => {
    onChange({
      customRestrictions: settings.customRestrictions.filter((r) => r !== restriction),
    });
  };

  const currentPreset = COMPLIANCE_PRESETS[settings.complianceMode];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compliance Mode</CardTitle>
        <CardDescription>Apply regulatory compliance restrictions to AI features</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Compliance Presets */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(
            Object.entries(COMPLIANCE_PRESETS) as [
              ComplianceLevel,
              (typeof COMPLIANCE_PRESETS)["standard"],
            ][]
          ).map(([level, preset]) => (
            <button
              key={level}
              onClick={() => onChange({ complianceMode: level })}
              className={cn(
                "rounded-lg border p-4 text-left transition-colors",
                settings.complianceMode === level
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                <span className="font-medium">{preset.name}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{preset.description}</p>
            </button>
          ))}
        </div>

        {/* Active Restrictions */}
        {currentPreset.restrictions.length > 0 && (
          <div className="space-y-3">
            <Label>Active Restrictions</Label>
            <div className="rounded-lg border p-4">
              <ul className="space-y-2">
                {currentPreset.restrictions.map((restriction) => (
                  <li key={restriction} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    {restriction}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Custom Restrictions */}
        <div className="space-y-3">
          <Label>Custom Restrictions</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Add a custom restriction..."
              value={newRestriction}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNewRestriction(e.target.value)
              }
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomRestriction();
                }
              }}
            />
            <Button onClick={addCustomRestriction} variant="outline">
              Add
            </Button>
          </div>
          {settings.customRestrictions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {settings.customRestrictions.map((restriction) => (
                <Badge key={restriction} variant="secondary" className="flex items-center gap-1">
                  {restriction}
                  <button
                    onClick={() => removeCustomRestriction(restriction)}
                    className="ml-1 hover:text-destructive"
                  >
                    <span className="sr-only">Remove</span>×
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// AUDIT LOGS SECTION
// ============================================================

function AuditLogsSection({
  logs,
  auditLoggingEnabled,
  onToggleAuditLogging,
}: {
  logs: AuditLogEntry[];
  auditLoggingEnabled: boolean;
  onToggleAuditLogging: (enabled: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Audit Logging</CardTitle>
              <CardDescription>Track AI feature usage across your organization</CardDescription>
            </div>
            <Switch checked={auditLoggingEnabled} onCheckedChange={onToggleAuditLogging} />
          </div>
        </CardHeader>
        <CardContent>
          {auditLoggingEnabled ? (
            logs.length > 0 ? (
              <div className="space-y-2">
                {logs.map((log, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{log.feature}</p>
                        <p className="text-xs text-muted-foreground">{log.userEmail}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs">{log.tokensUsed} tokens</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="w-full">
                  View All Logs
                </Button>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <FileCheck className="mx-auto h-8 w-8 opacity-50" />
                <p className="mt-2">No audit logs yet</p>
              </div>
            )
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Eye className="mx-auto h-8 w-8 opacity-50" />
              <p className="mt-2">Audit logging is disabled</p>
              <p className="text-xs">Enable to track AI usage</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// SKELETON
// ============================================================

function AdminAISettingsSkeleton() {
  return (
    <div className="container max-w-5xl space-y-6 py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}

export default AdminAISettingsPage;
