import React, { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { Shield, Clock, Smartphone } from "lucide-react";
import { MFAPolicy } from "../../data/policies";
import { useAdminToast } from "../../hooks/useAdminToast";

interface MFAPolicyEditorProps {
  open: boolean;
  onClose: () => void;
  policy: MFAPolicy;
  onSave: (policy: MFAPolicy) => Promise<void>;
}

export const MFAPolicyEditor: React.FC<MFAPolicyEditorProps> = ({
  open,
  onClose,
  policy,
  onSave,
}) => {
  const toast = useAdminToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<MFAPolicy>(policy);

  useEffect(() => {
    setFormData(policy);
  }, [policy]);

  const handleMethodToggle = (
    method: "TOTP" | "SMS" | "WebAuthn",
    checked: boolean,
  ) => {
    setFormData((prev) => ({
      ...prev,
      methods: checked
        ? [...prev.methods, method]
        : prev.methods.filter((m) => m !== method),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.methods.length === 0) {
      toast.error("At least one MFA method must be selected");
      return;
    }

    if (formData.gracePeriodDays < 0 || formData.rememberDeviceDays < 0) {
      toast.error("Days must be non-negative values");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
      toast.success("MFA policy updated • View in Audit Log");
    } catch (error) {
      toast.error("Failed to update MFA policy");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData(policy); // Reset form data
      onClose();
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            MFA Settings
          </SheetTitle>
          <SheetDescription>
            Configure multi-factor authentication requirements for users
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {/* MFA Required */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="required"
              checked={formData.required}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, required: !!checked }))
              }
              disabled={isSubmitting}
            />
            <Label htmlFor="required" className="font-medium">
              Require MFA for all users
            </Label>
          </div>

          {/* MFA Methods */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Allowed MFA Methods</Label>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="totp"
                  checked={formData.methods.includes("TOTP")}
                  onCheckedChange={(checked) =>
                    handleMethodToggle("TOTP", !!checked)
                  }
                  disabled={isSubmitting}
                />
                <Label htmlFor="totp" className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  TOTP (Authenticator App)
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sms"
                  checked={formData.methods.includes("SMS")}
                  onCheckedChange={(checked) =>
                    handleMethodToggle("SMS", !!checked)
                  }
                  disabled={isSubmitting}
                />
                <Label htmlFor="sms" className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  SMS Text Message
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="webauthn"
                  checked={formData.methods.includes("WebAuthn")}
                  onCheckedChange={(checked) =>
                    handleMethodToggle("WebAuthn", !!checked)
                  }
                  disabled={isSubmitting}
                />
                <Label htmlFor="webauthn" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  WebAuthn (Hardware Keys)
                </Label>
              </div>
            </div>
          </div>

          {/* Grace Period */}
          <div className="space-y-2">
            <Label htmlFor="gracePeriod" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Grace Period (days)
            </Label>
            <Input
              id="gracePeriod"
              type="number"
              min="0"
              max="365"
              value={formData.gracePeriodDays}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  gracePeriodDays: parseInt(e.target.value) || 0,
                }))
              }
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-500">
              Days users can delay MFA setup after first login
            </p>
          </div>

          {/* Remember Device */}
          <div className="space-y-2">
            <Label htmlFor="rememberDevice">Remember Device (days)</Label>
            <Input
              id="rememberDevice"
              type="number"
              min="0"
              max="365"
              value={formData.rememberDeviceDays}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  rememberDeviceDays: parseInt(e.target.value) || 0,
                }))
              }
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-500">
              Days to remember trusted devices (0 = always require MFA)
            </p>
          </div>

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
