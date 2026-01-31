"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  MessageSquare,
  Reply,
  AlertTriangle,
  Shield,
  ShieldCheck,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  X,
  Loader2,
  CheckCircle,
  Settings,
  Lock,
  Globe,
  Zap,
  FileText,
  Mail,
  Folder,
  Clock,
  Database,
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// Separator not currently used but kept for future
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
// Tooltip imports removed - not currently used
import { cn } from "@/lib/utils";

// ============================================================
// TYPES (inline for component, would normally import from @/types)
// ============================================================

interface AIFeatureToggles {
  summarization: boolean;
  smartReply: boolean;
  autoReply: "off" | "suggest" | "draft" | "auto";
  priorityDetection: boolean;
  spamFiltering: boolean;
  draftAssistant: boolean;
}

interface AIPersonalization {
  tonePreference: "professional" | "casual" | "match_sender" | "custom";
  customInstructions: string;
  languagePreference: string;
  writingStyle: "concise" | "detailed" | "balanced";
  signatureInclusion: boolean;
  formalityLevel: "formal" | "neutral" | "informal";
}

interface AIPrivacySettings {
  dataRetentionDays: 7 | 30 | 90 | 365 | -1;
  allowAnonymousTraining: boolean;
  excludedSenders: string[];
  excludedDomains: string[];
  excludedFolders: string[];
  encryptAIData: boolean;
  logAIAccess: boolean;
  shareContextWithAI: "minimal" | "standard" | "full";
}

interface AIServiceStatus {
  available: boolean;
  provider: string;
  model: string;
  latencyMs?: number;
  quotaRemaining?: number;
  quotaResetAt?: string;
  message?: string;
}

interface AIUsageStats {
  tokensUsed: number;
  tokenLimit: number;
  requestCount: number;
  featureBreakdown: Record<string, number>;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

interface AISettingsPageProps {
  userId: string;
  orgId: string;
  isAdmin?: boolean;
}

export function AISettingsPage({
  userId,
  orgId: _orgId,
  isAdmin = false,
}: Readonly<AISettingsPageProps>) {
  const [activeTab, setActiveTab] = useState("features");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Settings state
  const [features, setFeatures] = useState<AIFeatureToggles>({
    summarization: true,
    smartReply: true,
    autoReply: "off",
    priorityDetection: true,
    spamFiltering: true,
    draftAssistant: true,
  });

  const [personalization, setPersonalization] = useState<AIPersonalization>({
    tonePreference: "professional",
    customInstructions: "",
    languagePreference: "en",
    writingStyle: "balanced",
    signatureInclusion: true,
    formalityLevel: "neutral",
  });

  const [privacy, setPrivacy] = useState<AIPrivacySettings>({
    dataRetentionDays: 30,
    allowAnonymousTraining: false,
    excludedSenders: [],
    excludedDomains: [],
    excludedFolders: ["Drafts", "Trash"],
    encryptAIData: true,
    logAIAccess: true,
    shareContextWithAI: "standard",
  });

  // Service status
  const [aiStatus, setAiStatus] = useState<AIServiceStatus | null>(null);
  const [usage, setUsage] = useState<AIUsageStats | null>(null);

  // Load settings
  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const [settingsRes, statusRes, usageRes] = await Promise.all([
        fetch(`/api/v1/ai/settings/${userId}`),
        fetch("/api/v1/ai/status"),
        fetch(`/api/v1/ai/usage/${userId}`),
      ]);

      if (settingsRes.ok) {
        const data = (await settingsRes.json()) as {
          features?: AIFeatureToggles;
          personalization?: AIPersonalization;
          privacy?: AIPrivacySettings;
        };
        if (data.features) setFeatures(data.features);
        if (data.personalization) setPersonalization(data.personalization);
        if (data.privacy) setPrivacy(data.privacy);
      }

      if (statusRes.ok) {
        const status = (await statusRes.json()) as AIServiceStatus;
        setAiStatus(status);
      }

      if (usageRes.ok) {
        const usageData = (await usageRes.json()) as AIUsageStats;
        setUsage(usageData);
      }
    } catch (error) {
      console.error("Failed to load AI settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Save settings
  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/v1/ai/settings/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features, personalization, privacy }),
      });

      if (response.ok) {
        setHasChanges(false);
      }
    } catch (error) {
      console.error("Failed to save AI settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Track changes
  const updateFeatures = (updates: Partial<AIFeatureToggles>) => {
    setFeatures((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const updatePersonalization = (updates: Partial<AIPersonalization>) => {
    setPersonalization((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const updatePrivacy = (updates: Partial<AIPrivacySettings>) => {
    setPrivacy((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  if (isLoading) {
    return <AISettingsSkeleton />;
  }

  return (
    <div className="container max-w-4xl space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Settings</h1>
          <p className="text-muted-foreground">Configure how AI assists with your email workflow</p>
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

      {/* AI Status Banner */}
      <AIStatusBanner status={aiStatus} usage={usage} />

      {/* Settings Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="features" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Features
          </TabsTrigger>
          <TabsTrigger value="personalization" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Personalization
          </TabsTrigger>
          <TabsTrigger value="privacy" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Privacy
          </TabsTrigger>
        </TabsList>

        <TabsContent value="features" className="space-y-4">
          <FeatureTogglesSection
            features={features}
            onChange={updateFeatures}
            aiAvailable={aiStatus?.available ?? false}
          />
        </TabsContent>

        <TabsContent value="personalization" className="space-y-4">
          <PersonalizationSection
            personalization={personalization}
            onChange={updatePersonalization}
          />
        </TabsContent>

        <TabsContent value="privacy" className="space-y-4">
          <PrivacyControlsSection privacy={privacy} onChange={updatePrivacy} userId={userId} />
        </TabsContent>
      </Tabs>

      {/* Admin Link */}
      {isAdmin && (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-100 p-2 dark:bg-violet-900">
                <Lock className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="font-medium">Organization AI Settings</p>
                <p className="text-sm text-muted-foreground">
                  Configure AI settings for your entire organization
                </p>
              </div>
            </div>
            <Button variant="outline" asChild>
              <a href="/settings/admin/ai">Manage</a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// AI STATUS BANNER
// ============================================================

function AIStatusBanner({
  status,
  usage,
}: {
  status: AIServiceStatus | null;
  usage: AIUsageStats | null;
}) {
  if (!status) return null;

  const usagePercent = usage ? (usage.tokensUsed / usage.tokenLimit) * 100 : 0;

  return (
    <Card
      className={cn(
        !status.available && "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
      )}
    >
      <CardContent className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          {status.available ? (
            <div className="rounded-full bg-green-100 p-2 dark:bg-green-900">
              <Zap className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
          ) : (
            <div className="rounded-full bg-amber-100 p-2 dark:bg-amber-900">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">
                {status.available ? "AI Services Active" : "AI Services Unavailable"}
              </p>
              {status.available && (
                <Badge variant="secondary" className="text-xs">
                  {status.provider} / {status.model}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {status.available
                ? `Response time: ${status.latencyMs ?? "—"}ms`
                : (status.message ?? "AI features are temporarily unavailable")}
            </p>
          </div>
        </div>

        {usage && status.available && (
          <div className="w-48">
            <div className="mb-1 flex justify-between text-xs">
              <span>Token Usage</span>
              <span>
                {usage.tokensUsed.toLocaleString()} / {usage.tokenLimit.toLocaleString()}
              </span>
            </div>
            <Progress value={usagePercent} className="h-2" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// FEATURE TOGGLES SECTION
// ============================================================

interface FeatureTogglesSectionProps {
  features: AIFeatureToggles;
  onChange: (updates: Partial<AIFeatureToggles>) => void;
  aiAvailable: boolean;
}

function FeatureTogglesSection({ features, onChange, aiAvailable }: FeatureTogglesSectionProps) {
  const featureList = [
    {
      key: "summarization" as const,
      title: "Email Summarization",
      description: "Generate concise summaries of long emails and threads",
      icon: FileText,
    },
    {
      key: "smartReply" as const,
      title: "Smart Reply",
      description: "Get AI-suggested replies based on email context",
      icon: MessageSquare,
    },
    {
      key: "priorityDetection" as const,
      title: "Priority Detection",
      description: "Automatically detect and flag important emails",
      icon: AlertTriangle,
    },
    {
      key: "spamFiltering" as const,
      title: "AI Spam Filtering",
      description: "Enhanced spam detection using AI analysis",
      icon: Shield,
    },
    {
      key: "draftAssistant" as const,
      title: "Draft Assistant",
      description: "AI helps improve your email drafts",
      icon: Sparkles,
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">AI Features</CardTitle>
          <CardDescription>
            Enable or disable individual AI-powered features. Disabled features will not process
            your email data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {featureList.map((feature) => (
            <div
              key={feature.key}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-muted p-2">
                  <feature.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <Label htmlFor={feature.key} className="font-medium">
                    {feature.title}
                  </Label>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </div>
              <Switch
                id={feature.key}
                checked={features[feature.key]}
                onCheckedChange={(checked: boolean) => onChange({ [feature.key]: checked })}
                disabled={!aiAvailable}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Auto-Reply Special Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Reply className="h-5 w-5 text-violet-500" />
            <CardTitle className="text-lg">Auto-Reply Mode</CardTitle>
          </div>
          <CardDescription>
            Configure how AI handles automatic email responses. Higher automation levels require
            more caution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <AutoReplyModeSelector
              value={features.autoReply}
              onChange={(value) => onChange({ autoReply: value })}
              disabled={!aiAvailable}
            />

            {features.autoReply === "auto" && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    Full automation enabled
                  </p>
                  <p className="text-amber-700 dark:text-amber-300">
                    AI will send replies automatically without your review. Configure safeguards in
                    Auto-Reply settings to prevent unintended responses.
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AutoReplyModeSelector({
  value,
  onChange,
  disabled,
}: {
  value: AIFeatureToggles["autoReply"];
  onChange: (value: AIFeatureToggles["autoReply"]) => void;
  disabled?: boolean;
}) {
  const modes = [
    {
      value: "off" as const,
      label: "Off",
      description: "No automatic replies",
      icon: EyeOff,
    },
    {
      value: "suggest" as const,
      label: "Suggest",
      description: "Show reply suggestions only",
      icon: MessageSquare,
    },
    {
      value: "draft" as const,
      label: "Draft",
      description: "Create drafts for your review",
      icon: FileText,
    },
    {
      value: "auto" as const,
      label: "Auto-Send",
      description: "Send replies automatically",
      icon: Zap,
      warning: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {modes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          onClick={() => onChange(mode.value)}
          disabled={disabled}
          className={cn(
            "flex flex-col items-center rounded-lg border p-4 text-center transition-colors",
            value === mode.value
              ? mode.warning
                ? "border-amber-500 bg-amber-50 dark:bg-amber-950"
                : "border-primary bg-primary/5"
              : "border-border hover:border-primary/50",
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          <mode.icon
            className={cn(
              "mb-2 h-5 w-5",
              value === mode.value
                ? mode.warning
                  ? "text-amber-600"
                  : "text-primary"
                : "text-muted-foreground"
            )}
          />
          <span className="text-sm font-medium">{mode.label}</span>
          <span className="mt-1 text-xs text-muted-foreground">{mode.description}</span>
        </button>
      ))}
    </div>
  );
}

// ============================================================
// PERSONALIZATION SECTION
// ============================================================

interface PersonalizationSectionProps {
  personalization: AIPersonalization;
  onChange: (updates: Partial<AIPersonalization>) => void;
}

function PersonalizationSection({ personalization, onChange }: PersonalizationSectionProps) {
  const languages = [
    { value: "en", label: "English" },
    { value: "es", label: "Spanish" },
    { value: "fr", label: "French" },
    { value: "de", label: "German" },
    { value: "it", label: "Italian" },
    { value: "pt", label: "Portuguese" },
    { value: "zh", label: "Chinese" },
    { value: "ja", label: "Japanese" },
    { value: "ko", label: "Korean" },
    { value: "ar", label: "Arabic" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Communication Style</CardTitle>
          <CardDescription>
            Customize how AI generates responses to match your preferred communication style
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Tone Preference */}
          <div className="space-y-3">
            <Label>Tone Preference</Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { value: "professional", label: "Professional", desc: "Formal business tone" },
                { value: "casual", label: "Casual", desc: "Friendly and relaxed" },
                { value: "match_sender", label: "Match Sender", desc: "Adapt to sender style" },
                { value: "custom", label: "Custom", desc: "Use custom instructions" },
              ].map((tone) => (
                <button
                  key={tone.value}
                  type="button"
                  onClick={() =>
                    onChange({
                      tonePreference: tone.value as AIPersonalization["tonePreference"],
                    })
                  }
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    personalization.tonePreference === tone.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <span className="text-sm font-medium">{tone.label}</span>
                  <p className="mt-1 text-xs text-muted-foreground">{tone.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Writing Style */}
          <div className="space-y-3">
            <Label>Writing Style</Label>
            <Select
              value={personalization.writingStyle}
              onValueChange={(value: AIPersonalization["writingStyle"]) =>
                onChange({ writingStyle: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="concise">Concise - Brief and to the point</SelectItem>
                <SelectItem value="balanced">Balanced - Standard length</SelectItem>
                <SelectItem value="detailed">Detailed - Comprehensive responses</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Formality Level */}
          <div className="space-y-3">
            <Label>Formality Level</Label>
            <Select
              value={personalization.formalityLevel}
              onValueChange={(value: AIPersonalization["formalityLevel"]) =>
                onChange({ formalityLevel: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="formal">Formal - Traditional business language</SelectItem>
                <SelectItem value="neutral">Neutral - Professional but approachable</SelectItem>
                <SelectItem value="informal">Informal - Conversational style</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Language Preference */}
          <div className="space-y-3">
            <Label>Language Preference</Label>
            <Select
              value={personalization.languagePreference}
              onValueChange={(value: string) => onChange({ languagePreference: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Signature Inclusion */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="signature">Include Signature</Label>
              <p className="text-sm text-muted-foreground">
                Automatically append your signature to AI-generated drafts
              </p>
            </div>
            <Switch
              id="signature"
              checked={personalization.signatureInclusion}
              onCheckedChange={(checked: boolean) => onChange({ signatureInclusion: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Custom Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Custom Instructions</CardTitle>
          <CardDescription>
            Provide specific instructions for how AI should behave when helping with your emails
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Example: Always address recipients by their first name. Include a brief greeting before getting to the main content. Use bullet points when listing multiple items..."
            value={personalization.customInstructions}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              onChange({ customInstructions: e.target.value })
            }
            rows={5}
            className="resize-none"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {personalization.customInstructions.length}/1000 characters
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// PRIVACY CONTROLS SECTION
// ============================================================

interface PrivacyControlsSectionProps {
  privacy: AIPrivacySettings;
  onChange: (updates: Partial<AIPrivacySettings>) => void;
  userId: string;
}

function PrivacyControlsSection({ privacy, onChange, userId }: PrivacyControlsSectionProps) {
  const [newExclusion, setNewExclusion] = useState("");
  const [exclusionType, setExclusionType] = useState<"sender" | "domain" | "folder">("sender");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const addExclusion = () => {
    if (!newExclusion.trim()) return;

    const value = newExclusion.trim();
    if (exclusionType === "sender") {
      if (!privacy.excludedSenders.includes(value)) {
        onChange({ excludedSenders: [...privacy.excludedSenders, value] });
      }
    } else if (exclusionType === "domain") {
      if (!privacy.excludedDomains.includes(value)) {
        onChange({ excludedDomains: [...privacy.excludedDomains, value] });
      }
    } else {
      if (!privacy.excludedFolders.includes(value)) {
        onChange({ excludedFolders: [...privacy.excludedFolders, value] });
      }
    }
    setNewExclusion("");
  };

  const removeExclusion = (type: "sender" | "domain" | "folder", value: string) => {
    if (type === "sender") {
      onChange({ excludedSenders: privacy.excludedSenders.filter((s) => s !== value) });
    } else if (type === "domain") {
      onChange({ excludedDomains: privacy.excludedDomains.filter((d) => d !== value) });
    } else {
      onChange({ excludedFolders: privacy.excludedFolders.filter((f) => f !== value) });
    }
  };

  const handleDeleteAllData = async () => {
    if (deleteConfirm !== "DELETE") return;

    setIsDeleting(true);
    try {
      await fetch(`/api/v1/ai/data/${userId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteType: "all", confirmPhrase: "DELETE" }),
      });
      // Reset state or show success
    } catch (error) {
      console.error("Failed to delete AI data:", error);
    } finally {
      setIsDeleting(false);
      setDeleteConfirm("");
    }
  };

  return (
    <div className="space-y-4">
      {/* Data Retention */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Data Retention</CardTitle>
          </div>
          <CardDescription>
            Control how long AI-related data is stored. Shorter retention periods enhance privacy
            but may reduce personalization accuracy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Label>Retention Period</Label>
            <Select
              value={String(privacy.dataRetentionDays)}
              onValueChange={(value: string) =>
                onChange({
                  dataRetentionDays: Number(value) as AIPrivacySettings["dataRetentionDays"],
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days - Maximum privacy</SelectItem>
                <SelectItem value="30">30 days - Recommended</SelectItem>
                <SelectItem value="90">90 days - Better personalization</SelectItem>
                <SelectItem value="365">1 year - Full history</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              AI interaction history, cached responses, and learning data will be automatically
              deleted after this period.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Context Sharing */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Context Sharing</CardTitle>
          </div>
          <CardDescription>
            Control how much email context is shared with AI for analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            {[
              {
                value: "minimal" as const,
                label: "Minimal",
                description: "Only basic metadata (sender, subject line)",
                icon: ShieldCheck,
              },
              {
                value: "standard" as const,
                label: "Standard",
                description: "Email content for current request only",
                icon: Shield,
              },
              {
                value: "full" as const,
                label: "Full",
                description: "Full thread context for better responses",
                icon: Globe,
              },
            ].map((level) => (
              <button
                key={level.value}
                type="button"
                onClick={() => onChange({ shareContextWithAI: level.value })}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors",
                  privacy.shareContextWithAI === level.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <level.icon
                  className={cn(
                    "h-5 w-5",
                    privacy.shareContextWithAI === level.value
                      ? "text-primary"
                      : "text-muted-foreground"
                  )}
                />
                <div>
                  <span className="font-medium">{level.label}</span>
                  <p className="text-sm text-muted-foreground">{level.description}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Exclusions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <EyeOff className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">AI Exclusions</CardTitle>
          </div>
          <CardDescription>
            Emails from these senders, domains, or folders will never be processed by AI features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add exclusion */}
          <div className="flex gap-2">
            <Select
              value={exclusionType}
              onValueChange={(v: "sender" | "domain" | "folder") => setExclusionType(v)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sender">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Sender
                  </div>
                </SelectItem>
                <SelectItem value="domain">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Domain
                  </div>
                </SelectItem>
                <SelectItem value="folder">
                  <div className="flex items-center gap-2">
                    <Folder className="h-4 w-4" />
                    Folder
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder={
                exclusionType === "sender"
                  ? "email@example.com"
                  : exclusionType === "domain"
                    ? "example.com"
                    : "Folder name"
              }
              value={newExclusion}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewExclusion(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addExclusion();
                }
              }}
              className="flex-1"
            />
            <Button onClick={addExclusion} size="icon" variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Exclusion lists */}
          <div className="space-y-3">
            {privacy.excludedSenders.length > 0 && (
              <div>
                <Label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" /> Excluded Senders
                </Label>
                <div className="flex flex-wrap gap-2">
                  {privacy.excludedSenders.map((sender) => (
                    <Badge key={sender} variant="secondary" className="flex items-center gap-1">
                      {sender}
                      <button
                        onClick={() => removeExclusion("sender", sender)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {privacy.excludedDomains.length > 0 && (
              <div>
                <Label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Globe className="h-3 w-3" /> Excluded Domains
                </Label>
                <div className="flex flex-wrap gap-2">
                  {privacy.excludedDomains.map((domain) => (
                    <Badge key={domain} variant="secondary" className="flex items-center gap-1">
                      {domain}
                      <button
                        onClick={() => removeExclusion("domain", domain)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {privacy.excludedFolders.length > 0 && (
              <div>
                <Label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Folder className="h-3 w-3" /> Excluded Folders
                </Label>
                <div className="flex flex-wrap gap-2">
                  {privacy.excludedFolders.map((folder) => (
                    <Badge key={folder} variant="secondary" className="flex items-center gap-1">
                      {folder}
                      <button
                        onClick={() => removeExclusion("folder", folder)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Training Data Opt-out */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Training Data</CardTitle>
          </div>
          <CardDescription>
            Control whether your data can be used to improve AI models
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label htmlFor="training-opt-out">Allow Anonymous Training Data</Label>
              <p className="text-sm text-muted-foreground">
                Help improve AI by contributing anonymized, aggregated data. Your personal
                information is never shared.
              </p>
            </div>
            <Switch
              id="training-opt-out"
              checked={privacy.allowAnonymousTraining}
              onCheckedChange={(checked: boolean) => onChange({ allowAnonymousTraining: checked })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label htmlFor="encrypt-data">Encrypt AI Data at Rest</Label>
              <p className="text-sm text-muted-foreground">
                All AI-related data is encrypted when stored
              </p>
            </div>
            <Switch
              id="encrypt-data"
              checked={privacy.encryptAIData}
              onCheckedChange={(checked: boolean) => onChange({ encryptAIData: checked })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label htmlFor="log-access">Log AI Access</Label>
              <p className="text-sm text-muted-foreground">
                Keep an audit log of all AI feature usage for transparency
              </p>
            </div>
            <Switch
              id="log-access"
              checked={privacy.logAIAccess}
              onCheckedChange={(checked: boolean) => onChange({ logAIAccess: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Delete All Data */}
      <Card className="border-destructive/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            <CardTitle className="text-lg text-destructive">Delete AI Data</CardTitle>
          </div>
          <CardDescription>
            Permanently delete all AI-related data associated with your account. This action cannot
            be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete All AI Data</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <p>This will permanently delete:</p>
                  <ul className="list-inside list-disc space-y-1 text-sm">
                    <li>All AI interaction history</li>
                    <li>Cached summaries and smart replies</li>
                    <li>Personalization data and preferences</li>
                    <li>Training data associated with your account</li>
                  </ul>
                  <p className="font-medium">
                    Type <span className="font-mono text-destructive">DELETE</span> to confirm:
                  </p>
                  <Input
                    value={deleteConfirm}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setDeleteConfirm(e.target.value)
                    }
                    placeholder="Type DELETE to confirm"
                    className="font-mono"
                  />
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteConfirm("")}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAllData}
                  disabled={deleteConfirm !== "DELETE" || isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Delete All Data"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// SKELETON LOADER
// ============================================================

function AISettingsSkeleton() {
  return (
    <div className="container max-w-4xl space-y-6 py-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-10 w-full" />
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}

export default AISettingsPage;
