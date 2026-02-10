"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Flag,
  Link as LinkIcon,
  User,
  Building2,
  Loader2,
  CheckCircle,
  Plus,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ============================================================
// TYPES
// ============================================================

interface PhishingReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emailId: string;
  senderEmail: string;
  subject?: string;
  detectedUrls?: string[];
  onSubmit?: (report: PhishingReportData) => Promise<void>;
}

interface PhishingReportData {
  emailId: string;
  senderEmail: string;
  category: PhishingCategory;
  description: string;
  suspiciousUrls: string[];
  impersonatedBrand: string;
  additionalNotes: string;
  forwardToAdmin: boolean;
}

type PhishingCategory =
  | "credential_theft"
  | "financial_fraud"
  | "impersonation"
  | "malware_link"
  | "business_email_compromise"
  | "gift_card_scam"
  | "tech_support_scam"
  | "other";

// ============================================================
// PHISHING REPORT MODAL
// ============================================================

export function PhishingReportModal({
  open,
  onOpenChange,
  emailId,
  senderEmail,
  subject,
  detectedUrls = [],
  onSubmit,
}: PhishingReportModalProps) {
  const [category, setCategory] = useState<PhishingCategory>("credential_theft");
  const [description, setDescription] = useState("");
  const [suspiciousUrls, setSuspiciousUrls] = useState<string[]>(detectedUrls);
  const [newUrl, setNewUrl] = useState("");
  const [impersonatedBrand, setImpersonatedBrand] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [forwardToAdmin, setForwardToAdmin] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const categories: { value: PhishingCategory; label: string; description: string }[] = [
    {
      value: "credential_theft",
      label: "Credential Theft",
      description: "Asks for passwords, login info, or security codes",
    },
    {
      value: "financial_fraud",
      label: "Financial Fraud",
      description: "Requests money, wire transfers, or payment info",
    },
    {
      value: "impersonation",
      label: "Brand Impersonation",
      description: "Pretends to be from a legitimate company",
    },
    {
      value: "malware_link",
      label: "Malicious Link",
      description: "Contains links to malware or suspicious downloads",
    },
    {
      value: "business_email_compromise",
      label: "Business Email Compromise",
      description: "Impersonates executive or vendor to request action",
    },
    {
      value: "gift_card_scam",
      label: "Gift Card Scam",
      description: "Requests purchase of gift cards",
    },
    {
      value: "tech_support_scam",
      label: "Tech Support Scam",
      description: "Claims computer issues requiring immediate action",
    },
    {
      value: "other",
      label: "Other",
      description: "Other type of phishing attempt",
    },
  ];

  const commonBrands = [
    "Microsoft",
    "Google",
    "Amazon",
    "Apple",
    "PayPal",
    "Netflix",
    "Facebook",
    "Bank",
    "IRS",
    "Other",
  ];

  const handleAddUrl = () => {
    if (newUrl && !suspiciousUrls.includes(newUrl)) {
      setSuspiciousUrls([...suspiciousUrls, newUrl]);
      setNewUrl("");
    }
  };

  const handleRemoveUrl = (url: string) => {
    setSuspiciousUrls(suspiciousUrls.filter((u) => u !== url));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    const report: PhishingReportData = {
      emailId,
      senderEmail,
      category,
      description,
      suspiciousUrls,
      impersonatedBrand,
      additionalNotes,
      forwardToAdmin,
    };

    try {
      if (onSubmit) {
        await onSubmit(report);
      } else {
        // Default API call
        await fetch("/api/v1/threat/feedback/phishing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email_id: emailId,
            sender_email: senderEmail,
            details: {
              category,
              description,
              suspicious_urls: suspiciousUrls,
              impersonated_brand: impersonatedBrand,
              additional_notes: additionalNotes,
            },
          }),
        });
      }

      setSubmitted(true);
      setTimeout(() => {
        onOpenChange(false);
        resetForm();
      }, 2000);
    } catch (error) {
      console.error("Failed to submit report:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setCategory("credential_theft");
    setDescription("");
    setSuspiciousUrls(detectedUrls);
    setNewUrl("");
    setImpersonatedBrand("");
    setAdditionalNotes("");
    setForwardToAdmin(true);
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center space-y-4 py-8">
            <div className="rounded-full bg-green-100 p-3 dark:bg-green-900">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-semibold">Report Submitted</h3>
            <p className="text-center text-sm text-muted-foreground">
              Thank you for reporting this phishing attempt. Our security team will investigate.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-red-500" />
            Report Phishing Email
          </DialogTitle>
          <DialogDescription>
            Help us protect your organization by providing details about this phishing attempt.
          </DialogDescription>
        </DialogHeader>

        {/* Email Info Summary */}
        <div className="space-y-1 rounded-lg bg-muted p-3">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">From:</span>
            <span className="font-medium">{senderEmail}</span>
          </div>
          {subject && (
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Subject:</span>
              <span className="truncate font-medium">{subject}</span>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Category Selection */}
          <div className="space-y-3">
            <Label className="text-base font-medium">What type of phishing is this?</Label>
            <RadioGroup
              value={category}
              onValueChange={(value) => setCategory(value as PhishingCategory)}
              className="grid grid-cols-2 gap-2"
            >
              {categories.map((cat) => (
                <button
                  type="button"
                  key={cat.value}
                  className={cn(
                    "flex cursor-pointer items-start space-x-3 rounded-lg border p-3 text-left transition-colors",
                    category === cat.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                  onClick={() => setCategory(cat.value)}
                >
                  <RadioGroupItem value={cat.value} id={cat.value} className="mt-1" />
                  <div className="space-y-1">
                    <Label htmlFor={cat.value} className="cursor-pointer font-medium">
                      {cat.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">{cat.description}</p>
                  </div>
                </button>
              ))}
            </RadioGroup>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Describe what made this suspicious</Label>
            <Textarea
              id="description"
              placeholder="e.g., Asked me to click a link to verify my account, but the link goes to a different domain..."
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDescription(e.target.value)
              }
              rows={3}
            />
          </div>

          {/* Impersonated Brand */}
          {(category === "impersonation" || category === "credential_theft") && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Which brand/company is being impersonated?
              </Label>
              <div className="mb-2 flex flex-wrap gap-2">
                {commonBrands.map((brand) => (
                  <Badge
                    key={brand}
                    variant={impersonatedBrand === brand ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setImpersonatedBrand(brand)}
                  >
                    {brand}
                  </Badge>
                ))}
              </div>
              <Input
                placeholder="Or type a custom brand name..."
                value={impersonatedBrand}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setImpersonatedBrand(e.target.value)
                }
              />
            </div>
          )}

          {/* Suspicious URLs */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              Suspicious URLs (optional)
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://suspicious-link.com/..."
                value={newUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewUrl(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddUrl();
                  }
                }}
              />
              <Button type="button" variant="outline" size="icon" onClick={handleAddUrl}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {suspiciousUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {suspiciousUrls.map((url, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="flex max-w-full items-center gap-1"
                  >
                    <span className="max-w-[200px] truncate">{url}</span>
                    <button onClick={() => handleRemoveUrl(url)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Additional Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any other details that might help our security team..."
              value={additionalNotes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setAdditionalNotes(e.target.value)
              }
              rows={2}
            />
          </div>

          {/* Forward to Admin */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="forward"
              checked={forwardToAdmin}
              onCheckedChange={(checked: boolean | "indeterminate") =>
                setForwardToAdmin(checked === true)
              }
            />
            <Label htmlFor="forward" className="cursor-pointer text-sm">
              Forward this email to the security team for review
            </Label>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-red-600 hover:bg-red-700"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Flag className="mr-2 h-4 w-4" />
                Submit Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PhishingReportModal;
