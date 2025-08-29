import { useState } from "react";
import { Bell, Volume2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export function NotificationsSettings() {
  const { toast } = useToast();

  const [desktopNotifications, setDesktopNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [workNotifications, setWorkNotifications] = useState(true);
  const [personalNotifications, setPersonalNotifications] = useState(true);

  const handleNotificationChange = (type: string, enabled: boolean) => {
    toast({
      title: "Notification updated",
      description: `${type} notifications ${enabled ? "enabled" : "disabled"}.`,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Notifications</h2>
        <p className="text-muted-foreground">
          Configure desktop notifications and alert preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Desktop Notifications
          </CardTitle>
          <CardDescription>
            Control when and how you receive notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Desktop Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Show notifications for new emails
              </p>
            </div>
            <Switch
              checked={desktopNotifications}
              onCheckedChange={(checked) => {
                setDesktopNotifications(checked);
                handleNotificationChange("Desktop", checked);
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Sound Alerts</Label>
              <p className="text-sm text-muted-foreground">
                Play sound for new messages
              </p>
            </div>
            <Switch
              checked={soundEnabled}
              onCheckedChange={(checked) => {
                setSoundEnabled(checked);
                handleNotificationChange("Sound", checked);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Label-Specific Notifications
          </CardTitle>
          <CardDescription>
            Override notification settings for specific labels.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Work Emails</Label>
              <p className="text-sm text-muted-foreground">
                Notifications for work-labeled emails
              </p>
            </div>
            <Switch
              checked={workNotifications}
              onCheckedChange={setWorkNotifications}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Personal Emails</Label>
              <p className="text-sm text-muted-foreground">
                Notifications for personal-labeled emails
              </p>
            </div>
            <Switch
              checked={personalNotifications}
              onCheckedChange={setPersonalNotifications}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
