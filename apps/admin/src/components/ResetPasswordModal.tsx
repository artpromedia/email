import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Copy, Check, ExternalLink } from "lucide-react";
import { ResetPasswordResponse } from "../data/users";
import { useAdminToast } from "../hooks/useAdminToast";

interface ResetPasswordModalProps {
  open: boolean;
  onClose: () => void;
  userName: string;
  userEmail: string;
  resetData?: ResetPasswordResponse;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  open,
  onClose,
  userName,
  userEmail,
  resetData,
}) => {
  const toast = useAdminToast();
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const copyToClipboard = async (text: string, type: "token" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "token") {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
      toast.success(
        `${type === "token" ? "Token" : "Link"} copied to clipboard`,
      );
    } catch (error) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const openLink = () => {
    if (resetData?.tempLink) {
      window.open(resetData.tempLink, "_blank");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Password Reset Generated</DialogTitle>
          <DialogDescription>
            Temporary password reset created for <strong>{userName}</strong> (
            {userEmail})
          </DialogDescription>
        </DialogHeader>

        {resetData && (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-yellow-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Security Notice
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>
                      This temporary reset expires in 24 hours. Share securely
                      with the user.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="tempToken">Temporary Token</Label>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <Input
                    id="tempToken"
                    type="text"
                    readOnly
                    value={resetData.tempToken}
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-2"
                    onClick={() =>
                      copyToClipboard(resetData.tempToken, "token")
                    }
                  >
                    {copiedToken ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="tempLink">Reset Link</Label>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <Input
                    id="tempLink"
                    type="text"
                    readOnly
                    value={resetData.tempLink}
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-2"
                    onClick={() => copyToClipboard(resetData.tempLink, "link")}
                  >
                    {copiedLink ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-2"
                    onClick={openLink}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="text-sm text-gray-500">
                <p>
                  <strong>Expires:</strong>{" "}
                  {resetData.expiresAt.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
