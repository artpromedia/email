import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSystemSettings } from "../data/systemSettings";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";

import {
  Settings,
  Shield,
  Mail,
  HardDrive,
  Globe,
  CheckCircle,
  XCircle,
} from "lucide-react";

const SystemSettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState("general");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: getSystemSettings,
  });

  const getStatusBadge = (enabled: boolean) => {
    return enabled ? (
      <Badge variant="default" className="flex items-center gap-1">
        <CheckCircle className="h-3 w-3" />
        Enabled
      </Badge>
    ) : (
      <Badge variant="secondary" className="flex items-center gap-1">
        <XCircle className="h-3 w-3" />
        Disabled
      </Badge>
    );
  };

  if (isLoading || !settings) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-12 bg-gray-200 rounded"></div>
          <div className="space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">System Settings</h1>
          <p className="text-gray-600 mt-1">
            Configure system-wide settings and preferences
          </p>
        </div>
      </div>

      {/* Settings Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general" className="flex items-center gap-1">
            <Settings className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-1">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="mail" className="flex items-center gap-1">
            <Mail className="h-4 w-4" />
            Mail
          </TabsTrigger>
          <TabsTrigger value="storage" className="flex items-center gap-1">
            <HardDrive className="h-4 w-4" />
            Storage
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                General Configuration
              </CardTitle>
              <CardDescription>
                Basic system settings and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    System Name
                  </label>
                  <Input value={settings.general.systemName} readOnly />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Admin Email
                  </label>
                  <Input value={settings.general.adminEmail} readOnly />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Timezone
                  </label>
                  <Input value={settings.general.timezone} readOnly />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Language
                  </label>
                  <Input value={settings.general.language} readOnly />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Configuration
              </CardTitle>
              <CardDescription>
                Security policies and access control
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Password Policy</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">
                        Min Length: {settings.security.passwordPolicy.minLength}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Require Uppercase</span>
                      {getStatusBadge(
                        settings.security.passwordPolicy.requireUppercase,
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Require Numbers</span>
                      {getStatusBadge(
                        settings.security.passwordPolicy.requireNumbers,
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">MFA Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Enforce for Admins</span>
                      {getStatusBadge(
                        settings.security.mfaSettings.enforceForAdmins,
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Enforce for All Users</span>
                      {getStatusBadge(
                        settings.security.mfaSettings.enforceForAllUsers,
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Access Control</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Geolocation Tracking</span>
                      {getStatusBadge(
                        settings.security.accessControl.geolocationTracking,
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Brute Force Protection</span>
                      {getStatusBadge(
                        settings.security.accessControl.bruteForceProtection,
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Mail Settings */}
        <TabsContent value="mail" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Mail Configuration
              </CardTitle>
              <CardDescription>SMTP and mail handling settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    SMTP Host
                  </label>
                  <Input value={settings.mail.smtpSettings.hostname} readOnly />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    SMTP Port
                  </label>
                  <Input
                    value={settings.mail.smtpSettings.port.toString()}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Max Message Size (MB)
                  </label>
                  <Input
                    value={settings.mail.messageSettings.maxMessageSize.toString()}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Encryption
                  </label>
                  <Input
                    value={settings.mail.smtpSettings.encryption}
                    readOnly
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Spam Filter</span>
                  {getStatusBadge(
                    settings.mail.filterSettings.enableSpamFilter,
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Virus Scanning</span>
                  {getStatusBadge(
                    settings.mail.filterSettings.enableVirusScanning,
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Quarantine</span>
                  {getStatusBadge(
                    settings.mail.quarantineSettings.enableQuarantine,
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Storage Settings */}
        <TabsContent value="storage" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5" />
                Storage Configuration
              </CardTitle>
              <CardDescription>
                Storage quotas and cleanup policies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Default Quota (GB)
                  </label>
                  <Input
                    value={settings.storage.defaultQuota.toString()}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Max Quota (GB)
                  </label>
                  <Input
                    value={settings.storage.maxQuota.toString()}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Warning Threshold (%)
                  </label>
                  <Input
                    value={settings.storage.warningThreshold.toString()}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Storage Location
                  </label>
                  <Input value={settings.storage.storageLocation} readOnly />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Compression</span>
                  {getStatusBadge(settings.storage.compressionEnabled)}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Deduplication</span>
                  {getStatusBadge(settings.storage.deduplicationEnabled)}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Auto Cleanup</span>
                  {getStatusBadge(
                    settings.storage.cleanupSettings.enableAutoCleanup,
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SystemSettingsPage;
