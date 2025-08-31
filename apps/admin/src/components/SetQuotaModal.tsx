import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { AdminUser } from "../data/users";
import { HardDrive } from "lucide-react";

interface SetQuotaModalProps {
  open: boolean;
  onClose: () => void;
  user?: AdminUser;
  onSetQuota: (quotaLimit: number) => Promise<void>;
}

export const SetQuotaModal: React.FC<SetQuotaModalProps> = ({
  open,
  onClose,
  user,
  onSetQuota,
}) => {
  const [quotaLimit, setQuotaLimit] = useState(
    user?.quotaLimit?.toString() || "10",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);
    try {
      await onSetQuota(parseInt(quotaLimit));
      onClose();
    } catch (error) {
      // Error handling is done in parent component
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  if (!user) return null;

  const currentUsage = user.quotaUsed;
  const newLimit = parseInt(quotaLimit);
  const isReducingBelowUsage = newLimit < currentUsage;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Storage Quota</DialogTitle>
          <DialogDescription>
            Update storage quota for <strong>{user.name}</strong> ({user.email})
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <HardDrive className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-900">
                  Current Usage
                </p>
                <p className="text-lg font-semibold text-blue-700">
                  {currentUsage.toFixed(1)} GB used
                </p>
                <p className="text-xs text-blue-600">
                  of {user.quotaLimit} GB limit (
                  {((currentUsage / user.quotaLimit) * 100).toFixed(1)}%)
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quotaLimit">New Storage Quota</Label>
            <Select
              value={quotaLimit}
              onValueChange={setQuotaLimit}
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 GB</SelectItem>
                <SelectItem value="10">10 GB</SelectItem>
                <SelectItem value="25">25 GB</SelectItem>
                <SelectItem value="50">50 GB</SelectItem>
                <SelectItem value="100">100 GB</SelectItem>
                <SelectItem value="250">250 GB</SelectItem>
                <SelectItem value="500">500 GB</SelectItem>
                <SelectItem value="1000">1 TB</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isReducingBelowUsage && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Warning: Quota Below Current Usage
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>
                      The new quota ({newLimit} GB) is less than current usage (
                      {currentUsage.toFixed(1)} GB). The user will not be able
                      to receive new emails until they free up space.
                    </p>
                  </div>
                </div>
              </div>
            </div>
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
            <Button
              type="submit"
              disabled={isSubmitting}
              variant={isReducingBelowUsage ? "destructive" : "default"}
            >
              {isSubmitting ? "Updating..." : "Update Quota"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
