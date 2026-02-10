"use client";

/**
 * Notification Settings Page
 * Configure email and push notification preferences
 */

import { useState, useEffect } from "react";
import { Bell, Mail, Smartphone, MessageSquare, Calendar } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Switch,
  Label,
  Button,
} from "@email/ui";

interface NotificationSettings {
  email: {
    newMessages: boolean;
    mentions: boolean;
    replies: boolean;
    digest: "none" | "daily" | "weekly";
  };
  push: {
    enabled: boolean;
    newMessages: boolean;
    mentions: boolean;
    calendarReminders: boolean;
  };
  chat: {
    directMessages: boolean;
    groupMentions: boolean;
    channelUpdates: boolean;
  };
  calendar: {
    eventReminders: boolean;
    invitations: boolean;
    changes: boolean;
  };
}

export default function NotificationsSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings>({
    email: {
      newMessages: false,
      mentions: false,
      replies: false,
      digest: "none",
    },
    push: {
      enabled: false,
      newMessages: false,
      mentions: false,
      calendarReminders: false,
    },
    chat: {
      directMessages: false,
      groupMentions: false,
      channelUpdates: false,
    },
    calendar: {
      eventReminders: false,
      invitations: false,
      changes: false,
    },
  });
  const [_loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch("/api/v1/user/settings/notifications");
        const data = (await response.json()) as { settings?: NotificationSettings };
        if (data.settings) {
          setSettings(data.settings);
        }
      } catch (err) {
        console.error("Failed to fetch notification settings:", err);
      } finally {
        setLoading(false);
      }
    };
    void fetchSettings();
  }, []);

  const handleSave = () => {
    // TODO: Implement save settings API call
    alert("Notification settings saved");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Bell className="h-6 w-6" />
            Notification Settings
          </h1>
          <p className="text-muted-foreground">Configure how and when you receive notifications</p>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Notifications
          </CardTitle>
          <CardDescription>Receive notifications via email</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>New Messages</Label>
              <p className="text-sm text-muted-foreground">
                Get notified when you receive new emails
              </p>
            </div>
            <Switch
              checked={settings.email.newMessages}
              onCheckedChange={(checked: boolean) =>
                setSettings({
                  ...settings,
                  email: { ...settings.email, newMessages: checked },
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Mentions</Label>
              <p className="text-sm text-muted-foreground">
                Get notified when someone mentions you
              </p>
            </div>
            <Switch
              checked={settings.email.mentions}
              onCheckedChange={(checked: boolean) =>
                setSettings({
                  ...settings,
                  email: { ...settings.email, mentions: checked },
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Replies</Label>
              <p className="text-sm text-muted-foreground">
                Get notified when someone replies to your emails
              </p>
            </div>
            <Switch
              checked={settings.email.replies}
              onCheckedChange={(checked: boolean) =>
                setSettings({
                  ...settings,
                  email: { ...settings.email, replies: checked },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Email Digest</Label>
            <div className="flex gap-2">
              {(["none", "daily", "weekly"] as const).map((option) => (
                <Button
                  key={option}
                  variant={settings.email.digest === option ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      email: { ...settings.email, digest: option },
                    })
                  }
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Push Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Push Notifications
          </CardTitle>
          <CardDescription>Receive notifications on your devices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Push Notifications</Label>
              <p className="text-sm text-muted-foreground">Allow notifications on this device</p>
            </div>
            <Switch
              checked={settings.push.enabled}
              onCheckedChange={(checked: boolean) =>
                setSettings({
                  ...settings,
                  push: { ...settings.push, enabled: checked },
                })
              }
            />
          </div>
          {settings.push.enabled && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <Label>New Messages</Label>
                  <p className="text-sm text-muted-foreground">Push notification for new emails</p>
                </div>
                <Switch
                  checked={settings.push.newMessages}
                  onCheckedChange={(checked: boolean) =>
                    setSettings({
                      ...settings,
                      push: { ...settings.push, newMessages: checked },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Mentions</Label>
                  <p className="text-sm text-muted-foreground">Push notification when mentioned</p>
                </div>
                <Switch
                  checked={settings.push.mentions}
                  onCheckedChange={(checked: boolean) =>
                    setSettings({
                      ...settings,
                      push: { ...settings.push, mentions: checked },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Calendar Reminders</Label>
                  <p className="text-sm text-muted-foreground">
                    Push notification for upcoming events
                  </p>
                </div>
                <Switch
                  checked={settings.push.calendarReminders}
                  onCheckedChange={(checked: boolean) =>
                    setSettings({
                      ...settings,
                      push: { ...settings.push, calendarReminders: checked },
                    })
                  }
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Chat Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Chat Notifications
          </CardTitle>
          <CardDescription>Configure chat notification preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Direct Messages</Label>
              <p className="text-sm text-muted-foreground">Notify for direct messages</p>
            </div>
            <Switch
              checked={settings.chat.directMessages}
              onCheckedChange={(checked: boolean) =>
                setSettings({
                  ...settings,
                  chat: { ...settings.chat, directMessages: checked },
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Group Mentions</Label>
              <p className="text-sm text-muted-foreground">Notify when mentioned in groups</p>
            </div>
            <Switch
              checked={settings.chat.groupMentions}
              onCheckedChange={(checked: boolean) =>
                setSettings({
                  ...settings,
                  chat: { ...settings.chat, groupMentions: checked },
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Channel Updates</Label>
              <p className="text-sm text-muted-foreground">Notify for all channel messages</p>
            </div>
            <Switch
              checked={settings.chat.channelUpdates}
              onCheckedChange={(checked: boolean) =>
                setSettings({
                  ...settings,
                  chat: { ...settings.chat, channelUpdates: checked },
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Calendar Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Calendar Notifications
          </CardTitle>
          <CardDescription>Configure calendar notification preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Event Reminders</Label>
              <p className="text-sm text-muted-foreground">Remind before scheduled events</p>
            </div>
            <Switch
              checked={settings.calendar.eventReminders}
              onCheckedChange={(checked: boolean) =>
                setSettings({
                  ...settings,
                  calendar: { ...settings.calendar, eventReminders: checked },
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Invitations</Label>
              <p className="text-sm text-muted-foreground">Notify for new event invitations</p>
            </div>
            <Switch
              checked={settings.calendar.invitations}
              onCheckedChange={(checked: boolean) =>
                setSettings({
                  ...settings,
                  calendar: { ...settings.calendar, invitations: checked },
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Event Changes</Label>
              <p className="text-sm text-muted-foreground">
                Notify when events are updated or cancelled
              </p>
            </div>
            <Switch
              checked={settings.calendar.changes}
              onCheckedChange={(checked: boolean) =>
                setSettings({
                  ...settings,
                  calendar: { ...settings.calendar, changes: checked },
                })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
