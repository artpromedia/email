import { useState } from "react";
import { User, Upload, Mail, Globe, Clock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export function AccountSettings() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState(user?.name || "");
  const [avatar] = useState(user?.avatar || "");
  const [primaryEmail] = useState(user?.email || "");
  const [timezone, setTimezone] = useState("America/New_York");
  const [locale, setLocale] = useState("en-US");
  const [aliases, setAliases] = useState([
    { id: "1", email: "support@ceerion.com", verified: true },
    { id: "2", email: "noreply@ceerion.com", verified: false },
  ]);
  const [newAlias, setNewAlias] = useState("");

  const handleSaveProfile = () => {
    // TODO: Implement API call
    toast({
      title: "Profile updated",
      description: "Your profile information has been saved successfully.",
    });
  };

  const handleAvatarUpload = () => {
    // TODO: Implement avatar upload
    toast({
      title: "Avatar upload",
      description:
        "Avatar upload functionality will be implemented with backend.",
    });
  };

  const handleAddAlias = () => {
    if (newAlias && newAlias.includes("@")) {
      const alias = {
        id: Date.now().toString(),
        email: newAlias,
        verified: false,
      };
      setAliases([...aliases, alias]);
      setNewAlias("");
      toast({
        title: "Alias added",
        description: `Email alias ${newAlias} has been added. Verification email sent.`,
      });
    }
  };

  const handleRemoveAlias = (id: string) => {
    setAliases(aliases.filter((alias) => alias.id !== id));
    toast({
      title: "Alias removed",
      description: "Email alias has been removed from your account.",
    });
  };

  const timezones = [
    { value: "America/New_York", label: "Eastern Time (ET)" },
    { value: "America/Chicago", label: "Central Time (CT)" },
    { value: "America/Denver", label: "Mountain Time (MT)" },
    { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
    { value: "Europe/London", label: "Greenwich Mean Time (GMT)" },
    { value: "Europe/Paris", label: "Central European Time (CET)" },
    { value: "Asia/Tokyo", label: "Japan Standard Time (JST)" },
    { value: "Asia/Shanghai", label: "China Standard Time (CST)" },
  ];

  const locales = [
    { value: "en-US", label: "English (United States)" },
    { value: "en-GB", label: "English (United Kingdom)" },
    { value: "es-ES", label: "Español (España)" },
    { value: "fr-FR", label: "Français (France)" },
    { value: "de-DE", label: "Deutsch (Deutschland)" },
    { value: "ja-JP", label: "日本語 (日本)" },
    { value: "zh-CN", label: "中文 (简体)" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Account Settings</h2>
        <p className="text-muted-foreground">
          Manage your personal information and account preferences.
        </p>
      </div>

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Information
          </CardTitle>
          <CardDescription>
            Update your display name and profile picture.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar Upload */}
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={avatar} alt={displayName} />
              <AvatarFallback className="text-lg">
                {displayName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <Button variant="outline" onClick={handleAvatarUpload}>
                <Upload className="mr-2 h-4 w-4" />
                Upload new picture
              </Button>
              <p className="text-xs text-muted-foreground">
                JPG, PNG or GIF. Max size 2MB.
              </p>
            </div>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your display name"
            />
          </div>

          <Button onClick={handleSaveProfile}>Save Profile</Button>
        </CardContent>
      </Card>

      {/* Email Addresses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Addresses
          </CardTitle>
          <CardDescription>
            Manage your primary email address and aliases.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Primary Email */}
          <div className="space-y-2">
            <Label>Primary Email Address</Label>
            <div className="flex items-center gap-2">
              <Input value={primaryEmail} disabled />
              <Badge variant="secondary">Primary</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              This is your main email address used for account notifications.
            </p>
          </div>

          <Separator />

          {/* Email Aliases */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Email Aliases</Label>
              <p className="text-xs text-muted-foreground">
                {aliases.length} alias{aliases.length !== 1 ? "es" : ""}{" "}
                configured
              </p>
            </div>

            {/* Alias List */}
            <div className="space-y-2">
              {aliases.map((alias) => (
                <div
                  key={alias.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{alias.email}</span>
                    <Badge variant={alias.verified ? "default" : "secondary"}>
                      {alias.verified ? "Verified" : "Pending"}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveAlias(alias.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Add New Alias */}
            <div className="flex gap-2">
              <Input
                placeholder="new-alias@ceerion.com"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
              />
              <Button onClick={handleAddAlias} disabled={!newAlias}>
                <Plus className="mr-2 h-4 w-4" />
                Add Alias
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Localization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Localization
          </CardTitle>
          <CardDescription>
            Set your timezone and language preferences.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Timezone */}
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Locale */}
            <div className="space-y-2">
              <Label htmlFor="locale">Language & Region</Label>
              <Select value={locale} onValueChange={setLocale}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locales.map((loc) => (
                    <SelectItem key={loc.value} value={loc.value}>
                      {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Current time:{" "}
            {new Date().toLocaleString(locale, { timeZone: timezone })}
          </div>

          <Button onClick={handleSaveProfile}>Save Preferences</Button>
        </CardContent>
      </Card>
    </div>
  );
}
