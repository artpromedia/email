import React, { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { ExternalLink, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { ExternalBannerPolicy } from "../../data/policies";
import { useAdminToast } from "../../hooks/useAdminToast";

interface ExternalBannerPolicyEditorProps {
  open: boolean;
  onClose: () => void;
  policy: ExternalBannerPolicy;
  onSave: (policy: ExternalBannerPolicy) => Promise<void>;
}

const bannerTypeIcons = {
  warning: AlertTriangle,
  info: Info,
  error: AlertCircle,
};

const bannerTypeColors = {
  warning: "text-amber-600 bg-amber-50 border-amber-200",
  info: "text-blue-600 bg-blue-50 border-blue-200",
  error: "text-red-600 bg-red-50 border-red-200",
};

export const ExternalBannerPolicyEditor: React.FC<
  ExternalBannerPolicyEditorProps
> = ({ open, onClose, policy, onSave }) => {
  const toast = useAdminToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ExternalBannerPolicy>(policy);

  useEffect(() => {
    setFormData(policy);
  }, [policy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.enabled && !formData.message.trim()) {
      toast.error("Banner message is required when enabled");
      return;
    }

    if (formData.message.length > 500) {
      toast.error("Banner message must be 500 characters or less");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
      toast.success("External banner policy updated • View in Audit Log");
    } catch (error) {
      toast.error("Failed to update external banner policy");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData(policy);
      onClose();
    }
  };

  const IconComponent = bannerTypeIcons[formData.type];

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            External Banner
          </SheetTitle>
          <SheetDescription>
            Configure warning banners for external email recipients
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {/* Enable Banner */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="enabled"
              checked={formData.enabled}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, enabled: !!checked }))
              }
              disabled={isSubmitting}
            />
            <Label htmlFor="enabled" className="font-medium">
              Enable external warning banner
            </Label>
          </div>

          {formData.enabled && (
            <>
              {/* Banner Type */}
              <div className="space-y-2">
                <Label htmlFor="type">Banner Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: "warning" | "info" | "error") =>
                    setFormData((prev) => ({ ...prev, type: value }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select banner type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warning">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        Warning
                      </div>
                    </SelectItem>
                    <SelectItem value="info">
                      <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-blue-600" />
                        Information
                      </div>
                    </SelectItem>
                    <SelectItem value="error">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        Error/Critical
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Banner Message */}
              <div className="space-y-2">
                <Label htmlFor="message">Banner Message</Label>
                <Textarea
                  id="message"
                  placeholder="Enter warning message for external emails..."
                  value={formData.message}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      message: e.target.value,
                    }))
                  }
                  disabled={isSubmitting}
                  rows={4}
                  maxLength={500}
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Shown to external email recipients</span>
                  <span>{formData.message.length}/500</span>
                </div>
              </div>

              {/* Banner Preview */}
              {formData.message.trim() && (
                <div className="space-y-2">
                  <Label>Preview</Label>
                  <div
                    className={`
                    p-3 rounded-lg border flex items-start gap-2
                    ${bannerTypeColors[formData.type]}
                  `}
                  >
                    <IconComponent className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">{formData.message}</div>
                  </div>
                </div>
              )}

              {/* Additional Options */}
              <div className="space-y-3 border-t pt-4">
                <Label className="text-sm font-medium">Display Options</Label>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showInSubject"
                    checked={formData.showInSubject}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        showInSubject: !!checked,
                      }))
                    }
                    disabled={isSubmitting}
                  />
                  <Label htmlFor="showInSubject">
                    Prepend "[EXTERNAL]" to subject line
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showInBody"
                    checked={formData.showInBody}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        showInBody: !!checked,
                      }))
                    }
                    disabled={isSubmitting}
                  />
                  <Label htmlFor="showInBody">
                    Show banner at top of email body
                  </Label>
                </div>
              </div>

              {/* Exemptions */}
              <div className="space-y-2">
                <Label htmlFor="exemptDomains">Exempt Domains</Label>
                <Textarea
                  id="exemptDomains"
                  placeholder="partner.com&#10;trusted-client.org&#10;subsidiary.net"
                  value={formData.exemptDomains.join("\n")}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      exemptDomains: e.target.value
                        .split("\n")
                        .filter((d) => d.trim()),
                    }))
                  }
                  disabled={isSubmitting}
                  rows={3}
                />
                <p className="text-xs text-gray-500">
                  One domain per line. Emails from these domains won't show the
                  banner.
                </p>
              </div>
            </>
          )}

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Policy"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
};
