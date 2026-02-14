"use client";

/**
 * Preferences Settings Page
 * Configure display, language, and email preferences
 */

import { useState, useEffect } from "react";
import { Settings2, Palette, Globe, Mail, Type, Moon, Sun, Monitor } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@email/ui";

interface Preferences {
  display: {
    theme: "light" | "dark" | "system";
    density: "comfortable" | "compact";
    fontSize: "small" | "medium" | "large";
  };
  language: {
    locale: string;
    timezone: string;
    dateFormat: string;
    timeFormat: "12h" | "24h";
  };
  email: {
    defaultReplyAll: boolean;
    confirmDelete: boolean;
    showImages: boolean;
    conversationView: boolean;
    previewPane: "right" | "bottom" | "none";
    markReadDelay: number;
  };
  compose: {
    defaultFont: string;
    defaultFontSize: number;
    includeOriginal: boolean;
    signatureEnabled: boolean;
  };
}

export default function PreferencesSettingsPage() {
  const [preferences, setPreferences] = useState<Preferences>({
    display: {
      theme: "system",
      density: "comfortable",
      fontSize: "medium",
    },
    language: {
      locale: "en-US",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      dateFormat: "MM/DD/YYYY",
      timeFormat: "12h",
    },
    email: {
      defaultReplyAll: false,
      confirmDelete: true,
      showImages: true,
      conversationView: true,
      previewPane: "right",
      markReadDelay: 3,
    },
    compose: {
      defaultFont: "Arial",
      defaultFontSize: 14,
      includeOriginal: true,
      signatureEnabled: false,
    },
  });
  const [_loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        const response = await fetch("/api/v1/user/settings/preferences");
        const data = (await response.json()) as { preferences: Preferences };
        setPreferences(data.preferences);
      } catch (err) {
        console.error("Failed to fetch preferences:", err);
      } finally {
        setLoading(false);
      }
    };
    void fetchPreferences();
  }, []);

  const handleSave = async () => {
    try {
      const API_URL = process.env["NEXT_PUBLIC_AUTH_API_URL"] || "http://localhost:8081";
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${API_URL}/api/v1/auth/preferences`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(preferences),
      });
      if (!response.ok) {
        throw new Error(`Failed to save preferences: ${response.statusText}`);
      }
      alert("Preferences saved");
    } catch (error) {
      console.error("Failed to save preferences:", error);
      alert(error instanceof Error ? error.message : "Failed to save preferences");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Settings2 className="h-6 w-6" />
            Preferences
          </h1>
          <p className="text-muted-foreground">Customize your email experience</p>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Display Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Display
          </CardTitle>
          <CardDescription>Customize the look and feel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Theme</Label>
            <div className="flex gap-2">
              {(["light", "dark", "system"] as const).map((theme) => {
                const Icon = { light: Sun, dark: Moon, system: Monitor }[theme];
                return (
                  <Button
                    key={theme}
                    variant={preferences.display.theme === theme ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      setPreferences({
                        ...preferences,
                        display: { ...preferences.display, theme },
                      })
                    }
                    className="flex items-center gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    {theme.charAt(0).toUpperCase() + theme.slice(1)}
                  </Button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Density</Label>
            <div className="flex gap-2">
              {(["comfortable", "compact"] as const).map((density) => (
                <Button
                  key={density}
                  variant={preferences.display.density === density ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setPreferences({
                      ...preferences,
                      display: { ...preferences.display, density },
                    })
                  }
                >
                  {density.charAt(0).toUpperCase() + density.slice(1)}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Font Size</Label>
            <div className="flex gap-2">
              {(["small", "medium", "large"] as const).map((size) => (
                <Button
                  key={size}
                  variant={preferences.display.fontSize === size ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setPreferences({
                      ...preferences,
                      display: { ...preferences.display, fontSize: size },
                    })
                  }
                >
                  {size.charAt(0).toUpperCase() + size.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Language & Region */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Language & Region
          </CardTitle>
          <CardDescription>Set your language and regional preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Language</Label>
              <Select
                value={preferences.language.locale}
                onValueChange={(value: string) =>
                  setPreferences({
                    ...preferences,
                    language: { ...preferences.language, locale: value },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en-US">English (US)</SelectItem>
                  <SelectItem value="en-GB">English (UK)</SelectItem>
                  <SelectItem value="es-ES">Español</SelectItem>
                  <SelectItem value="fr-FR">Français</SelectItem>
                  <SelectItem value="de-DE">Deutsch</SelectItem>
                  <SelectItem value="ja-JP">日本語</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select
                value={preferences.language.timezone}
                onValueChange={(value: string) =>
                  setPreferences({
                    ...preferences,
                    language: { ...preferences.language, timezone: value },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                  <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                  <SelectItem value="Europe/London">London (GMT)</SelectItem>
                  <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date Format</Label>
              <Select
                value={preferences.language.dateFormat}
                onValueChange={(value: string) =>
                  setPreferences({
                    ...preferences,
                    language: { ...preferences.language, dateFormat: value },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Time Format</Label>
              <div className="flex gap-2">
                {(["12h", "24h"] as const).map((format) => (
                  <Button
                    key={format}
                    variant={preferences.language.timeFormat === format ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      setPreferences({
                        ...preferences,
                        language: { ...preferences.language, timeFormat: format },
                      })
                    }
                  >
                    {format === "12h" ? "12-hour" : "24-hour"}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Reading
          </CardTitle>
          <CardDescription>Configure email reading preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Conversation View</Label>
              <p className="text-sm text-muted-foreground">Group emails by conversation</p>
            </div>
            <Switch
              checked={preferences.email.conversationView}
              onCheckedChange={(checked: boolean) =>
                setPreferences({
                  ...preferences,
                  email: { ...preferences.email, conversationView: checked },
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Show External Images</Label>
              <p className="text-sm text-muted-foreground">Automatically load images in emails</p>
            </div>
            <Switch
              checked={preferences.email.showImages}
              onCheckedChange={(checked: boolean) =>
                setPreferences({
                  ...preferences,
                  email: { ...preferences.email, showImages: checked },
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Confirm Before Delete</Label>
              <p className="text-sm text-muted-foreground">
                Ask for confirmation before deleting emails
              </p>
            </div>
            <Switch
              checked={preferences.email.confirmDelete}
              onCheckedChange={(checked: boolean) =>
                setPreferences({
                  ...preferences,
                  email: { ...preferences.email, confirmDelete: checked },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Preview Pane</Label>
            <div className="flex gap-2">
              {(["right", "bottom", "none"] as const).map((pane) => (
                <Button
                  key={pane}
                  variant={preferences.email.previewPane === pane ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setPreferences({
                      ...preferences,
                      email: { ...preferences.email, previewPane: pane },
                    })
                  }
                >
                  {pane.charAt(0).toUpperCase() + pane.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compose Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="h-5 w-5" />
            Email Composing
          </CardTitle>
          <CardDescription>Configure email composing preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Default Reply All</Label>
              <p className="text-sm text-muted-foreground">Reply to all recipients by default</p>
            </div>
            <Switch
              checked={preferences.email.defaultReplyAll}
              onCheckedChange={(checked: boolean) =>
                setPreferences({
                  ...preferences,
                  email: { ...preferences.email, defaultReplyAll: checked },
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Include Original Message</Label>
              <p className="text-sm text-muted-foreground">Include original email when replying</p>
            </div>
            <Switch
              checked={preferences.compose.includeOriginal}
              onCheckedChange={(checked: boolean) =>
                setPreferences({
                  ...preferences,
                  compose: { ...preferences.compose, includeOriginal: checked },
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Email Signature</Label>
              <p className="text-sm text-muted-foreground">Append signature to outgoing emails</p>
            </div>
            <Switch
              checked={preferences.compose.signatureEnabled}
              onCheckedChange={(checked: boolean) =>
                setPreferences({
                  ...preferences,
                  compose: { ...preferences.compose, signatureEnabled: checked },
                })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
