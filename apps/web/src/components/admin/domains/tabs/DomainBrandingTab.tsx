"use client";

/**
 * Domain Branding Tab
 * Customize the visual branding for emails from this domain
 */

import { useState, useEffect } from "react";
import { Save, Upload, X, AlertCircle, CheckCircle2, Palette } from "lucide-react";
import type { DomainBranding } from "@email/types";
import { cn } from "@email/ui";

import {
  useDomainBranding,
  useUpdateDomainBranding,
  useUploadDomainLogo,
} from "@/lib/admin/domain-api";

// ============================================================
// TYPES
// ============================================================

interface DomainBrandingTabProps {
  domainId: string;
}

// ============================================================
// COLOR PICKER COMPONENT
// ============================================================

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-16 cursor-pointer rounded border border-neutral-200 dark:border-neutral-700"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className={cn(
            "flex-1 rounded-lg border border-neutral-200 px-4 py-2 font-mono text-sm",
            "bg-white dark:bg-neutral-800",
            "text-neutral-900 dark:text-neutral-100",
            "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          )}
        />
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function DomainBrandingTab({ domainId }: DomainBrandingTabProps) {
  const { data: currentBranding, isLoading } = useDomainBranding(domainId);
  const updateBranding = useUpdateDomainBranding();
  const uploadLogo = useUploadDomainLogo();

  const [branding, setBranding] = useState<DomainBranding>({
    logoUrl: "",
    primaryColor: "#0066cc",
    secondaryColor: "#f0f0f0",
    textColor: "#333333",
    linkColor: "#0066cc",
    footerHtml: "",
    customCss: "",
  });

  const [saved, setSaved] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (currentBranding) {
      setBranding(currentBranding);
      setLogoPreview(currentBranding.logoUrl || null);
    }
  }, [currentBranding]);

  const handleSave = async () => {
    try {
      await updateBranding.mutateAsync({ domainId, branding });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Failed to update branding:", error);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      const logoUrl = await uploadLogo.mutateAsync({ domainId, file });
      setBranding({ ...branding, logoUrl });
    } catch (error) {
      console.error("Failed to upload logo:", error);
    }
  };

  const handleRemoveLogo = () => {
    setBranding({ ...branding, logoUrl: "" });
    setLogoPreview(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Domain Branding
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Customize the look and feel of emails sent from this domain
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={updateBranding.isPending}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium",
            saved ? "bg-green-600 text-white" : "bg-blue-600 text-white hover:bg-blue-700",
            "disabled:opacity-50",
            "transition-colors duration-100"
          )}
        >
          {saved ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Changes
            </>
          )}
        </button>
      </div>

      {/* Branding Form */}
      <div className="space-y-8">
        {/* Logo */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <h3 className="text-base font-medium text-neutral-900 dark:text-neutral-100">Logo</h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Upload your company logo to appear in email headers and footers
          </p>

          <div className="mt-4">
            {logoPreview ? (
              <div className="flex items-start gap-4">
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="h-16 w-auto object-contain"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className={cn(
                    "rounded-lg border border-neutral-200 p-2 text-neutral-500",
                    "hover:bg-neutral-50 hover:text-red-600",
                    "dark:border-neutral-700 dark:hover:bg-neutral-800"
                  )}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed",
                  "border-neutral-200 bg-neutral-50 px-6 py-8",
                  "hover:border-blue-400 hover:bg-blue-50",
                  "dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-blue-600 dark:hover:bg-blue-900/20"
                )}
              >
                <Upload className="h-8 w-8 text-neutral-400" />
                <span className="mt-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
                  Click to upload logo
                </span>
                <span className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  PNG, JPG, or SVG up to 2MB
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* Colors */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <h3 className="text-base font-medium text-neutral-900 dark:text-neutral-100">Colors</h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Customize the color scheme for your emails
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ColorPicker
              label="Primary Color"
              value={branding.primaryColor}
              onChange={(color) => setBranding({ ...branding, primaryColor: color })}
            />
            <ColorPicker
              label="Secondary Color"
              value={branding.secondaryColor}
              onChange={(color) => setBranding({ ...branding, secondaryColor: color })}
            />
            <ColorPicker
              label="Text Color"
              value={branding.textColor}
              onChange={(color) => setBranding({ ...branding, textColor: color })}
            />
            <ColorPicker
              label="Link Color"
              value={branding.linkColor}
              onChange={(color) => setBranding({ ...branding, linkColor: color })}
            />
          </div>

          {/* Preview */}
          <div className="mt-6">
            <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Preview
            </div>
            <div
              className="mt-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-700"
              style={{
                backgroundColor: branding.secondaryColor,
                color: branding.textColor,
              }}
            >
              <div className="mb-2 border-b pb-2" style={{ borderColor: branding.primaryColor }}>
                <h4 style={{ color: branding.primaryColor }}>Email Header</h4>
              </div>
              <p className="text-sm">
                This is sample body text in your{" "}
                <a href="#" style={{ color: branding.linkColor }}>
                  chosen colors
                </a>
                .
              </p>
            </div>
          </div>
        </div>

        {/* Footer HTML */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <h3 className="text-base font-medium text-neutral-900 dark:text-neutral-100">
            Email Footer
          </h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Custom HTML to include at the bottom of all emails
          </p>

          <div className="mt-4">
            <textarea
              value={branding.footerHtml}
              onChange={(e) => setBranding({ ...branding, footerHtml: e.target.value })}
              placeholder="<p>&copy; 2024 Your Company. All rights reserved.</p>"
              rows={6}
              className={cn(
                "w-full rounded-lg border border-neutral-200 px-4 py-2 font-mono text-sm",
                "bg-white dark:bg-neutral-800",
                "text-neutral-900 dark:text-neutral-100",
                "placeholder-neutral-400 dark:placeholder-neutral-500",
                "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              )}
            />
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              Use HTML to format your footer. Keep it simple and test thoroughly.
            </p>
          </div>

          {/* Footer Preview */}
          {branding.footerHtml && (
            <div className="mt-4">
              <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Preview
              </div>
              <div
                className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800"
                dangerouslySetInnerHTML={{ __html: branding.footerHtml }}
              />
            </div>
          )}
        </div>

        {/* Custom CSS */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <h3 className="text-base font-medium text-neutral-900 dark:text-neutral-100">
            Custom CSS
          </h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Advanced: Add custom CSS for email styling
          </p>

          <div className="mt-4">
            <textarea
              value={branding.customCss}
              onChange={(e) => setBranding({ ...branding, customCss: e.target.value })}
              placeholder=".email-header { font-weight: bold; }"
              rows={8}
              className={cn(
                "w-full rounded-lg border border-neutral-200 px-4 py-2 font-mono text-sm",
                "bg-white dark:bg-neutral-800",
                "text-neutral-900 dark:text-neutral-100",
                "placeholder-neutral-400 dark:placeholder-neutral-500",
                "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              )}
            />
          </div>
        </div>

        {/* Warning Alert */}
        <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm text-amber-900 dark:text-amber-100">
            <p className="font-medium">Email Client Compatibility</p>
            <p className="mt-1 text-amber-800 dark:text-amber-200">
              Different email clients support different CSS features. Test your branding in popular
              clients (Gmail, Outlook, Apple Mail) to ensure it displays correctly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
