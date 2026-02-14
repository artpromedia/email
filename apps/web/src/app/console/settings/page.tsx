"use client";

import { useState } from "react";
import {
  Settings,
  User,
  Bell,
  Shield,
  Globe,
  Save,
  CheckCircle2,
  Copy,
  KeyRound,
} from "lucide-react";

interface OrgSettings {
  name: string;
  contact_email: string;
  website: string;
  default_from_name: string;
  default_from_email: string;
  timezone: string;
  tracking_opens: boolean;
  tracking_clicks: boolean;
  tracking_unsubscribes: boolean;
}

export default function ConsoleSettingsPage() {
  const [tab, setTab] = useState<"general" | "notifications" | "security">("general");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState<OrgSettings>({
    name: "",
    contact_email: "",
    website: "",
    default_from_name: "",
    default_from_email: "",
    timezone: "UTC",
    tracking_opens: true,
    tracking_clicks: true,
    tracking_unsubscribes: true,
  });

  const [notifications, setNotifications] = useState({
    daily_digest: true,
    bounce_alerts: true,
    complaint_alerts: true,
    usage_warnings: true,
    billing_alerts: true,
    weekly_report: false,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      await fetch("/api/v1/console/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(tab === "general" ? settings : { notifications }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // handle error
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof OrgSettings>(key: K, value: OrgSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const tabs = [
    { id: "general" as const, label: "General", icon: Settings },
    {
      id: "notifications" as const,
      label: "Notifications",
      icon: Bell,
    },
    { id: "security" as const, label: "Security", icon: Shield },
  ];

  return (
    <div className="max-w-4xl p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="mt-1 text-sm text-gray-400">Configure your organization and preferences</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-white/10">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === t.id
                ? "border-blue-500 text-white"
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Success toast */}
      {saved && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          Settings saved successfully
        </div>
      )}

      {/* General tab */}
      {tab === "general" && (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h3 className="mb-4 flex items-center gap-2 font-semibold">
              <User className="h-4 w-4 text-gray-400" />
              Organization
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="org-name" className="mb-1 block text-sm text-gray-400">
                  Organization name
                </label>
                <input
                  id="org-name"
                  type="text"
                  value={settings.name}
                  onChange={(e) => updateSetting("name", e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-gray-950 px-3 py-2 text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="contact-email" className="mb-1 block text-sm text-gray-400">
                  Contact email
                </label>
                <input
                  id="contact-email"
                  type="email"
                  value={settings.contact_email}
                  onChange={(e) => updateSetting("contact_email", e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-gray-950 px-3 py-2 text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="website" className="mb-1 block text-sm text-gray-400">
                  Website
                </label>
                <input
                  id="website"
                  type="url"
                  value={settings.website}
                  onChange={(e) => updateSetting("website", e.target.value)}
                  placeholder="https://yourdomain.com"
                  className="w-full rounded-lg border border-white/10 bg-gray-950 px-3 py-2 text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h3 className="mb-4 flex items-center gap-2 font-semibold">
              <Globe className="h-4 w-4 text-gray-400" />
              Sending defaults
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="from-name" className="mb-1 block text-sm text-gray-400">
                  Default &quot;From&quot; name
                </label>
                <input
                  id="from-name"
                  type="text"
                  value={settings.default_from_name}
                  onChange={(e) => updateSetting("default_from_name", e.target.value)}
                  placeholder="My Company"
                  className="w-full rounded-lg border border-white/10 bg-gray-950 px-3 py-2 text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="from-email" className="mb-1 block text-sm text-gray-400">
                  Default &quot;From&quot; email
                </label>
                <input
                  id="from-email"
                  type="email"
                  value={settings.default_from_email}
                  onChange={(e) => updateSetting("default_from_email", e.target.value)}
                  placeholder="noreply@yourdomain.com"
                  className="w-full rounded-lg border border-white/10 bg-gray-950 px-3 py-2 text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="timezone" className="mb-1 block text-sm text-gray-400">
                  Timezone
                </label>
                <select
                  id="timezone"
                  value={settings.timezone}
                  onChange={(e) => updateSetting("timezone", e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-gray-950 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern (US & Canada)</option>
                  <option value="America/Chicago">Central (US & Canada)</option>
                  <option value="America/Denver">Mountain (US & Canada)</option>
                  <option value="America/Los_Angeles">Pacific (US & Canada)</option>
                  <option value="Europe/London">London</option>
                  <option value="Europe/Berlin">Berlin</option>
                  <option value="Asia/Bangkok">Bangkok</option>
                  <option value="Asia/Tokyo">Tokyo</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h3 className="mb-4 font-semibold">Tracking</h3>
            <div className="space-y-3">
              {[
                {
                  key: "tracking_opens" as const,
                  label: "Open tracking",
                  desc: "Track when recipients open your emails",
                },
                {
                  key: "tracking_clicks" as const,
                  label: "Click tracking",
                  desc: "Track when recipients click links in your emails",
                },
                {
                  key: "tracking_unsubscribes" as const,
                  label: "Unsubscribe tracking",
                  desc: "Add unsubscribe headers and track opt-outs",
                },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex cursor-pointer items-center justify-between rounded-lg bg-white/5 p-3 transition hover:bg-white/10"
                >
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings[item.key]}
                    onChange={(e) => updateSetting(item.key, e.target.checked)}
                    className="h-4 w-4 rounded border-gray-600 accent-blue-500"
                  />
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium transition hover:bg-blue-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      )}

      {/* Notifications tab */}
      {tab === "notifications" && (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h3 className="mb-4 font-semibold">Email notifications</h3>
            <div className="space-y-3">
              {[
                {
                  key: "daily_digest" as const,
                  label: "Daily digest",
                  desc: "Daily summary of your email sending activity",
                },
                {
                  key: "bounce_alerts" as const,
                  label: "Bounce alerts",
                  desc: "Get notified when bounce rate exceeds 5%",
                },
                {
                  key: "complaint_alerts" as const,
                  label: "Spam complaint alerts",
                  desc: "Get notified when complaint rate exceeds 0.1%",
                },
                {
                  key: "usage_warnings" as const,
                  label: "Usage warnings",
                  desc: "Alert when approaching monthly email limit (80%, 95%)",
                },
                {
                  key: "billing_alerts" as const,
                  label: "Billing alerts",
                  desc: "Payment reminders and invoice notifications",
                },
                {
                  key: "weekly_report" as const,
                  label: "Weekly report",
                  desc: "Detailed weekly analytics report every Monday",
                },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex cursor-pointer items-center justify-between rounded-lg bg-white/5 p-3 transition hover:bg-white/10"
                >
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications[item.key]}
                    onChange={(e) =>
                      setNotifications((prev) => ({
                        ...prev,
                        [item.key]: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-gray-600 accent-blue-500"
                  />
                </label>
              ))}
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium transition hover:bg-blue-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save preferences"}
          </button>
        </div>
      )}

      {/* Security tab */}
      {tab === "security" && (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h3 className="mb-4 flex items-center gap-2 font-semibold">
              <KeyRound className="h-4 w-4 text-gray-400" />
              Organization ID
            </h3>
            <p className="mb-3 text-sm text-gray-400">
              Your unique organization identifier for API integration
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg border border-white/10 bg-gray-950 px-3 py-2 font-mono text-sm text-gray-300">
                org_xxxxxxxxxxxx
              </code>
              <button
                onClick={() => navigator.clipboard.writeText("org_xxxxxxxxxxxx")}
                className="rounded-lg bg-white/10 p-2 transition hover:bg-white/20"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h3 className="mb-4 flex items-center gap-2 font-semibold">
              <Shield className="h-4 w-4 text-gray-400" />
              IP allowlist
            </h3>
            <p className="mb-3 text-sm text-gray-400">
              Restrict API access to specific IP addresses. Leave empty to allow all IPs.
            </p>
            <textarea
              rows={4}
              placeholder="192.168.1.0/24&#10;10.0.0.1&#10;2001:db8::/32"
              className="w-full rounded-lg border border-white/10 bg-gray-950 px-3 py-2 font-mono text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="mt-3 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Update allowlist"}
            </button>
          </div>

          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
            <h3 className="mb-2 font-semibold text-red-400">Danger zone</h3>
            <p className="mb-4 text-sm text-gray-400">
              Permanently delete your organization and all associated data. This action cannot be
              undone.
            </p>
            <button className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-400 transition hover:bg-red-500/20">
              Delete organization
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
