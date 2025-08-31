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
import { Lock, Clock, AlertCircle } from "lucide-react";
import { PasswordPolicy } from "../../data/policies";
import { useAdminToast } from "../../hooks/useAdminToast";

interface PasswordPolicyEditorProps {
  open: boolean;
  onClose: () => void;
  policy: PasswordPolicy;
  onSave: (policy: PasswordPolicy) => Promise<void>;
}

export const PasswordPolicyEditor: React.FC<PasswordPolicyEditorProps> = ({
  open,
  onClose,
  policy,
  onSave,
}) => {
  const toast = useAdminToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<PasswordPolicy>(policy);

  useEffect(() => {
    setFormData(policy);
  }, [policy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.minLength < 4 || formData.minLength > 128) {
      toast.error("Password length must be between 4 and 128 characters");
      return;
    }

    if (formData.maxAgeDays < 0 || formData.maxAgeDays > 3650) {
      toast.error("Password age must be between 0 and 3650 days");
      return;
    }

    if (formData.historyCount < 0 || formData.historyCount > 50) {
      toast.error("Password history must be between 0 and 50");
      return;
    }

    if (formData.lockoutAttempts < 3 || formData.lockoutAttempts > 100) {
      toast.error("Lockout attempts must be between 3 and 100");
      return;
    }

    if (
      formData.lockoutDurationMinutes < 1 ||
      formData.lockoutDurationMinutes > 10080
    ) {
      toast.error("Lockout duration must be between 1 minute and 1 week");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
      toast.success("Password policy updated • View in Audit Log");
    } catch (error) {
      toast.error("Failed to update password policy");
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

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Password Rules
          </SheetTitle>
          <SheetDescription>
            Configure password complexity and security requirements
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {/* Password Length */}
          <div className="space-y-2">
            <Label htmlFor="minLength">Minimum Password Length</Label>
            <Input
              id="minLength"
              type="number"
              min="4"
              max="128"
              value={formData.minLength}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  minLength: parseInt(e.target.value) || 8,
                }))
              }
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-500">
              Minimum 4 characters, recommended 12 or more
            </p>
          </div>

          {/* Complexity Requirements */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Complexity Requirements
            </Label>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="requireUppercase"
                  checked={formData.requireUppercase}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      requireUppercase: !!checked,
                    }))
                  }
                  disabled={isSubmitting}
                />
                <Label htmlFor="requireUppercase">
                  Require uppercase letters (A-Z)
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="requireLowercase"
                  checked={formData.requireLowercase}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      requireLowercase: !!checked,
                    }))
                  }
                  disabled={isSubmitting}
                />
                <Label htmlFor="requireLowercase">
                  Require lowercase letters (a-z)
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="requireNumbers"
                  checked={formData.requireNumbers}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      requireNumbers: !!checked,
                    }))
                  }
                  disabled={isSubmitting}
                />
                <Label htmlFor="requireNumbers">Require numbers (0-9)</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="requireSymbols"
                  checked={formData.requireSymbols}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      requireSymbols: !!checked,
                    }))
                  }
                  disabled={isSubmitting}
                />
                <Label htmlFor="requireSymbols">
                  Require special characters (!@#$%^&*)
                </Label>
              </div>
            </div>
          </div>

          {/* Password Age */}
          <div className="space-y-2">
            <Label htmlFor="maxAge" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Maximum Password Age (days)
            </Label>
            <Input
              id="maxAge"
              type="number"
              min="0"
              max="3650"
              value={formData.maxAgeDays}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  maxAgeDays: parseInt(e.target.value) || 0,
                }))
              }
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-500">
              Force password change after this many days (0 = never expire)
            </p>
          </div>

          {/* Password History */}
          <div className="space-y-2">
            <Label htmlFor="history">Password History Count</Label>
            <Input
              id="history"
              type="number"
              min="0"
              max="50"
              value={formData.historyCount}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  historyCount: parseInt(e.target.value) || 0,
                }))
              }
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-500">
              Prevent reusing last N passwords (0 = allow reuse)
            </p>
          </div>

          {/* Account Lockout */}
          <div className="space-y-4 border-t pt-4">
            <Label className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Account Lockout Policy
            </Label>

            <div className="space-y-2">
              <Label htmlFor="lockoutAttempts">Failed Login Attempts</Label>
              <Input
                id="lockoutAttempts"
                type="number"
                min="3"
                max="100"
                value={formData.lockoutAttempts}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    lockoutAttempts: parseInt(e.target.value) || 5,
                  }))
                }
                disabled={isSubmitting}
              />
              <p className="text-xs text-gray-500">
                Lock account after this many failed attempts
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lockoutDuration">
                Lockout Duration (minutes)
              </Label>
              <Input
                id="lockoutDuration"
                type="number"
                min="1"
                max="10080"
                value={formData.lockoutDurationMinutes}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    lockoutDurationMinutes: parseInt(e.target.value) || 30,
                  }))
                }
                disabled={isSubmitting}
              />
              <p className="text-xs text-gray-500">
                How long to lock the account (max 1 week)
              </p>
            </div>
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
