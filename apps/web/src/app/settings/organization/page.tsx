"use client";

/**
 * Organization Settings Page
 * Manage organization profile and settings
 */

import { useState, useEffect, type ChangeEvent } from "react";
import { Building2, Upload, Users, Shield, Save } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Textarea,
  Switch,
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@email/ui";
import { getAuthApiUrl } from "@/lib/api-url";

interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string;
  logo: string;
  website: string;
  industry: string;
  size: string;
  settings: {
    allowPublicSignup: boolean;
    requireEmailVerification: boolean;
    enforceTwoFactor: boolean;
    allowExternalSharing: boolean;
  };
}

export default function OrganizationSettingsPage() {
  const [organization, setOrganization] = useState<Organization>({
    id: "",
    name: "",
    slug: "",
    description: "",
    logo: "",
    website: "",
    industry: "",
    size: "",
    settings: {
      allowPublicSignup: false,
      requireEmailVerification: true,
      enforceTwoFactor: false,
      allowExternalSharing: true,
    },
  });

  const [saving, setSaving] = useState(false);
  const [_loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrganization = async () => {
      try {
        const response = await fetch("/api/v1/organization");
        const data = (await response.json()) as { organization?: Organization };
        if (data.organization) {
          setOrganization(data.organization);
        }
      } catch (err) {
        console.error("Failed to fetch organization:", err);
      } finally {
        setLoading(false);
      }
    };
    void fetchOrganization();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const API_URL = getAuthApiUrl();
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${API_URL}/api/auth/organization`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(organization),
      });
      if (!response.ok) {
        throw new Error(`Failed to save organization: ${response.statusText}`);
      }
      alert("Organization settings saved");
    } catch (error) {
      console.error("Failed to save:", error);
      alert(error instanceof Error ? error.message : "Failed to save organization settings");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = () => {
    // TODO: Implement logo upload
    alert("Logo upload not yet implemented");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Building2 className="h-6 w-6" />
            Organization Settings
          </h1>
          <p className="text-muted-foreground">Manage your organization profile and settings</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Organization Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organization Profile
          </CardTitle>
          <CardDescription>Basic information about your organization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-6">
            <Avatar className="h-24 w-24">
              <AvatarImage src={organization.logo} alt={organization.name} />
              <AvatarFallback className="text-2xl">
                {organization.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <Button variant="outline" onClick={handleLogoUpload}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Logo
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Recommended: Square image, at least 200x200px
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
              <Input
                id="name"
                value={organization.name}
                onChange={(e) => setOrganization({ ...organization, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">URL Slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">mail.oonrumail.com/org/</span>
                <Input
                  id="slug"
                  value={organization.slug}
                  onChange={(e) => setOrganization({ ...organization, slug: e.target.value })}
                  className="max-w-[200px]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={organization.description}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setOrganization({ ...organization, description: e.target.value })
              }
              rows={3}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                value={organization.website}
                onChange={(e) => setOrganization({ ...organization, website: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                value={organization.industry}
                onChange={(e) => setOrganization({ ...organization, industry: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Policies
          </CardTitle>
          <CardDescription>Configure organization-wide security policies</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Require Email Verification</Label>
              <p className="text-sm text-muted-foreground">
                Users must verify their email before accessing the platform
              </p>
            </div>
            <Switch
              checked={organization.settings.requireEmailVerification}
              onCheckedChange={(checked: boolean) =>
                setOrganization({
                  ...organization,
                  settings: {
                    ...organization.settings,
                    requireEmailVerification: checked,
                  },
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Enforce Two-Factor Authentication</Label>
              <p className="text-sm text-muted-foreground">Require all users to enable 2FA</p>
            </div>
            <Switch
              checked={organization.settings.enforceTwoFactor}
              onCheckedChange={(checked: boolean) =>
                setOrganization({
                  ...organization,
                  settings: {
                    ...organization.settings,
                    enforceTwoFactor: checked,
                  },
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Allow External Sharing</Label>
              <p className="text-sm text-muted-foreground">
                Allow users to share files and calendars with external users
              </p>
            </div>
            <Switch
              checked={organization.settings.allowExternalSharing}
              onCheckedChange={(checked: boolean) =>
                setOrganization({
                  ...organization,
                  settings: {
                    ...organization.settings,
                    allowExternalSharing: checked,
                  },
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Allow Public Signup</Label>
              <p className="text-sm text-muted-foreground">
                Allow anyone with your domain email to join
              </p>
            </div>
            <Switch
              checked={organization.settings.allowPublicSignup}
              onCheckedChange={(checked: boolean) =>
                setOrganization({
                  ...organization,
                  settings: {
                    ...organization.settings,
                    allowPublicSignup: checked,
                  },
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Team Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Overview
          </CardTitle>
          <CardDescription>Quick overview of your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border p-4 text-center">
              <div className="text-3xl font-bold">12</div>
              <div className="text-sm text-muted-foreground">Total Members</div>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <div className="text-3xl font-bold">3</div>
              <div className="text-sm text-muted-foreground">Admins</div>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <div className="text-3xl font-bold">2</div>
              <div className="text-sm text-muted-foreground">Domains</div>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <div className="text-3xl font-bold">10</div>
              <div className="text-sm text-muted-foreground">Pending Invites</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions - proceed with caution</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Transfer Ownership</div>
              <div className="text-sm text-muted-foreground">
                Transfer organization ownership to another admin
              </div>
            </div>
            <Button variant="outline">Transfer</Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Delete Organization</div>
              <div className="text-sm text-muted-foreground">
                Permanently delete this organization and all data
              </div>
            </div>
            <Button variant="destructive">Delete Organization</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
