import { useState, useEffect } from "react";
import {
  useNavigate,
  useLocation,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// Import all settings tab components
import { AccountSettings } from "./settings/AccountSettings";
import { SecuritySettings } from "./settings/SecuritySettings";
import { MailSettings } from "./settings/MailSettings";
import RulesSettings from "./settings/RulesSettings";
import { ForwardingSettings } from "./settings/ForwardingSettings";
import { NotificationsSettings } from "./settings/NotificationsSettings";
import { AppearanceSettings } from "./settings/AppearanceSettings";
import { StorageSettings } from "./settings/StorageSettings";
import { AboutSettings } from "./settings/AboutSettings";

export function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Extract the current tab from the URL path
  const currentPath = location.pathname;
  const defaultTab = currentPath.includes("/settings/")
    ? currentPath.split("/settings/")[1] || "account"
    : "account";

  const [activeTab, setActiveTab] = useState(defaultTab);

  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    navigate(`/settings/${value}`);
  };

  // Update active tab when URL changes
  useEffect(() => {
    const tab = currentPath.split("/settings/")[1] || "account";
    setActiveTab(tab);
  }, [currentPath]);

  const handleBack = () => {
    navigate("/mail/inbox");
  };

  const tabs = [
    {
      id: "account",
      label: "Account",
      description: "Personal information and account details",
    },
    {
      id: "security",
      label: "Security",
      description: "Password, MFA, and security settings",
    },
    {
      id: "mail",
      label: "Mail",
      description: "Signatures, templates, and mail preferences",
    },
    {
      id: "filters",
      label: "Filters & Rules",
      description: "Manage email filters and automation",
    },
    {
      id: "forwarding",
      label: "Forwarding & Aliases",
      description: "Email forwarding and aliases",
    },
    {
      id: "notifications",
      label: "Notifications",
      description: "Desktop and email notifications",
    },
    {
      id: "appearance",
      label: "Appearance",
      description: "Theme, density, and visual preferences",
    },
    {
      id: "storage",
      label: "Storage & Data",
      description: "Storage usage and data management",
    },
    {
      id: "about",
      label: "About",
      description: "Version information and support",
    },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage your account settings and preferences
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium">{user?.email}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="max-w-6xl mx-auto p-6">
          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="space-y-6"
          >
            {/* Tab Navigation */}
            <TabsList className="grid w-full grid-cols-9 gap-1">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Tab Content */}
            <div className="min-h-[600px]">
              <TabsContent value="account" className="space-y-6">
                <AccountSettings />
              </TabsContent>

              <TabsContent value="security" className="space-y-6">
                <SecuritySettings />
              </TabsContent>

              <TabsContent value="mail" className="space-y-6">
                <MailSettings />
              </TabsContent>

              <TabsContent value="filters" className="space-y-6">
                <RulesSettings />
              </TabsContent>

              <TabsContent value="forwarding" className="space-y-6">
                <ForwardingSettings />
              </TabsContent>

              <TabsContent value="notifications" className="space-y-6">
                <NotificationsSettings />
              </TabsContent>

              <TabsContent value="appearance" className="space-y-6">
                <AppearanceSettings />
              </TabsContent>

              <TabsContent value="storage" className="space-y-6">
                <StorageSettings />
              </TabsContent>

              <TabsContent value="about" className="space-y-6">
                <AboutSettings />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
