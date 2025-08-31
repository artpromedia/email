import { useState } from "react";
import {
  Mail,
  FileText,
  Calendar,
  Settings,
  Trash2,
  Plus,
  Edit,
  Save,
  Copy,
  Star,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
  category: string;
  isFavorite: boolean;
  lastUsed?: string;
  createdAt: string;
  updatedAt: string;
}

interface Signature {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
  useForReply: boolean;
  useForForward: boolean;
  accounts: string[];
  updatedAt: string;
}

export function MailSettings() {
  const { toast } = useToast();

  // Signature management
  const [signatures, setSignatures] = useState<Signature[]>([
    {
      id: "1",
      name: "Default",
      content: "Best regards,\nJohn Doe\nCEERION Mail",
      isDefault: true,
      useForReply: true,
      useForForward: false,
      accounts: ["primary"],
      updatedAt: new Date().toISOString(),
    },
  ]);

  // Template management
  const [templates, setTemplates] = useState<EmailTemplate[]>([
    {
      id: "1",
      name: "Welcome Email",
      subject: "Welcome to our service!",
      content:
        "Dear [Name],\n\nWelcome to our service! We're excited to have you aboard.\n\nBest regards,\nThe Team",
      category: "welcome",
      isFavorite: true,
      lastUsed: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "2",
      name: "Follow-up Meeting",
      subject: "Following up on our meeting",
      content:
        "Hi [Name],\n\nThank you for taking the time to meet with me today. As discussed, I'm following up on [Topic].\n\nPlease let me know if you have any questions.\n\nBest regards,\n[Your Name]",
      category: "follow-up",
      isFavorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);

  // Mail behavior settings
  const [replyBehavior, setReplyBehavior] = useState("reply");
  const [composeMode, setComposeMode] = useState("rich");
  const [remoteImages, setRemoteImages] = useState("ask");
  const [externalSenderBanner, setExternalSenderBanner] = useState(true);
  const [readReceipts, setReadReceipts] = useState("ask");
  const [spellCheck, setSpellCheck] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [autoSaveInterval, setAutoSaveInterval] = useState("30");

  // Out-of-office settings
  const [oooEnabled, setOooEnabled] = useState(false);
  const [oooMessage, setOooMessage] = useState(
    "I'm currently out of office and will respond to your email when I return.",
  );
  const [oooStartDate, setOooStartDate] = useState("");
  const [oooEndDate, setOooEndDate] = useState("");
  const [oooInternalMessage, setOooInternalMessage] = useState("");
  const [oooExternalOnly, setOooExternalOnly] = useState(false);

  // Dialog states
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingSignature, setEditingSignature] = useState<Signature | null>(
    null,
  );
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(
    null,
  );

  // Form states
  const [signatureForm, setSignatureForm] = useState({
    name: "",
    content: "",
    isDefault: false,
    useForReply: true,
    useForForward: false,
    accounts: ["primary"],
  });

  const [templateForm, setTemplateForm] = useState({
    name: "",
    subject: "",
    content: "",
    category: "general",
  });

  const handleSaveSignature = () => {
    if (editingSignature) {
      setSignatures((prev) =>
        prev.map((sig) =>
          sig.id === editingSignature.id
            ? { ...sig, ...signatureForm, updatedAt: new Date().toISOString() }
            : signatureForm.isDefault
              ? { ...sig, isDefault: false }
              : sig,
        ),
      );
      toast({
        title: "Signature updated",
        description: "Your signature has been updated successfully.",
      });
    } else {
      const newSignature: Signature = {
        id: Date.now().toString(),
        ...signatureForm,
        updatedAt: new Date().toISOString(),
      };

      setSignatures((prev) =>
        signatureForm.isDefault
          ? prev
              .map((sig) => ({ ...sig, isDefault: false }))
              .concat(newSignature)
          : prev.concat(newSignature),
      );

      toast({
        title: "Signature created",
        description: "Your new signature has been created successfully.",
      });
    }

    setShowSignatureDialog(false);
    setEditingSignature(null);
    setSignatureForm({
      name: "",
      content: "",
      isDefault: false,
      useForReply: true,
      useForForward: false,
      accounts: ["primary"],
    });
  };

  const handleDeleteSignature = (id: string) => {
    const signature = signatures.find((s) => s.id === id);
    if (signature?.isDefault) {
      toast({
        title: "Cannot delete",
        description:
          "Cannot delete the default signature. Set another signature as default first.",
        variant: "destructive",
      });
      return;
    }

    setSignatures((prev) => prev.filter((s) => s.id !== id));
    toast({
      title: "Signature deleted",
      description: "The signature has been removed.",
    });
  };

  const handleSaveTemplate = () => {
    if (editingTemplate) {
      setTemplates((prev) =>
        prev.map((tmpl) =>
          tmpl.id === editingTemplate.id
            ? { ...tmpl, ...templateForm, updatedAt: new Date().toISOString() }
            : tmpl,
        ),
      );
      toast({
        title: "Template updated",
        description: "Your template has been updated successfully.",
      });
    } else {
      const newTemplate: EmailTemplate = {
        id: Date.now().toString(),
        ...templateForm,
        isFavorite: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setTemplates((prev) => prev.concat(newTemplate));
      toast({
        title: "Template created",
        description: "Your new template has been created successfully.",
      });
    }

    setShowTemplateDialog(false);
    setEditingTemplate(null);
    setTemplateForm({
      name: "",
      subject: "",
      content: "",
      category: "general",
    });
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast({
      title: "Template deleted",
      description: "The template has been removed.",
    });
  };

  const handleToggleTemplateFavorite = (id: string) => {
    setTemplates((prev) =>
      prev.map((tmpl) =>
        tmpl.id === id ? { ...tmpl, isFavorite: !tmpl.isFavorite } : tmpl,
      ),
    );
  };

  const handleCopyTemplate = (template: EmailTemplate) => {
    const newTemplate: EmailTemplate = {
      ...template,
      id: Date.now().toString(),
      name: `${template.name} (Copy)`,
      isFavorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setTemplates((prev) => prev.concat(newTemplate));
    toast({
      title: "Template copied",
      description: "A copy of the template has been created.",
    });
  };

  const handleSaveMailSettings = () => {
    toast({
      title: "Settings saved",
      description: "Your mail preferences have been updated.",
    });
  };

  const handleSaveOOO = () => {
    toast({
      title: "Out-of-office updated",
      description: oooEnabled
        ? "Your out-of-office message has been activated."
        : "Your out-of-office message has been deactivated.",
    });
  };

  const handleCreateSignature = () => {
    setEditingSignature(null);
    setSignatureForm({
      name: "",
      content: "",
      isDefault: false,
      useForReply: true,
      useForForward: false,
      accounts: ["primary"],
    });
    setShowSignatureDialog(true);
  };

  const handleEditSignature = (signature: Signature) => {
    setEditingSignature(signature);
    setSignatureForm({
      name: signature.name,
      content: signature.content,
      isDefault: signature.isDefault,
      useForReply: signature.useForReply,
      useForForward: signature.useForForward,
      accounts: signature.accounts,
    });
    setShowSignatureDialog(true);
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      name: "",
      subject: "",
      content: "",
      category: "general",
    });
    setShowTemplateDialog(true);
  };

  const handleEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      subject: template.subject,
      content: template.content,
      category: template.category,
    });
    setShowTemplateDialog(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Mail Settings</h2>
        <p className="text-muted-foreground">
          Configure your email signatures, templates, and mail behavior
          preferences.
        </p>
      </div>

      {/* Signatures */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Email Signatures
          </CardTitle>
          <CardDescription>
            Manage your email signatures for different accounts and aliases.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            {signatures.map((signature) => (
              <div key={signature.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium">{signature.name}</h4>
                      {signature.isDefault && (
                        <Badge variant="secondary">Default</Badge>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 whitespace-pre-wrap mb-2">
                      {signature.content}
                    </div>
                    <div className="flex gap-2 text-xs text-gray-500">
                      {signature.useForReply && <span>• Reply</span>}
                      {signature.useForForward && <span>• Forward</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditSignature(signature)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    {!signature.isDefault && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteSignature(signature.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button onClick={handleCreateSignature}>
            <Plus className="mr-2 h-4 w-4" />
            Add Signature
          </Button>
        </CardContent>
      </Card>

      {/* Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Templates
          </CardTitle>
          <CardDescription>
            Create and manage reusable email templates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {templates.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                No templates created yet
              </p>
              <Button onClick={handleCreateTemplate}>
                <FileText className="mr-2 h-4 w-4" />
                Create Template
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map((template) => (
                  <div key={template.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{template.name}</h4>
                        {template.isFavorite && (
                          <Star className="h-4 w-4 text-yellow-500" />
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleToggleTemplateFavorite(template.id)
                          }
                        >
                          <Star
                            className={`h-4 w-4 ${template.isFavorite ? "text-yellow-500" : ""}`}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyTemplate(template)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditTemplate(template)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTemplate(template.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      Subject: {template.subject}
                    </div>
                    <div className="text-sm text-gray-500 line-clamp-3">
                      {template.content}
                    </div>
                    <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                      <Badge variant="outline">{template.category}</Badge>
                      {template.lastUsed && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last used{" "}
                          {new Date(template.lastUsed).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Button onClick={handleCreateTemplate}>
                <Plus className="mr-2 h-4 w-4" />
                Add Template
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Mail Behavior */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Mail Behavior
          </CardTitle>
          <CardDescription>
            Configure default behaviors for composing and replying to emails.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Default Reply Behavior</Label>
              <Select value={replyBehavior} onValueChange={setReplyBehavior}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reply">Reply</SelectItem>
                  <SelectItem value="reply-all">Reply All</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Default Compose Mode</Label>
              <Select value={composeMode} onValueChange={setComposeMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rich">Rich Text</SelectItem>
                  <SelectItem value="plain">Plain Text</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Smart Features */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Remote Images</Label>
              <Select value={remoteImages} onValueChange={setRemoteImages}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="always">Always load</SelectItem>
                  <SelectItem value="ask">Ask before loading</SelectItem>
                  <SelectItem value="never">Never load</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Control when remote images are loaded in emails
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>External Sender Banner</Label>
                <p className="text-sm text-muted-foreground">
                  Show warning banner for emails from external senders
                </p>
              </div>
              <Switch
                checked={externalSenderBanner}
                onCheckedChange={setExternalSenderBanner}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Read Receipts</Label>
                <p className="text-sm text-muted-foreground">
                  Send read receipts when requested
                </p>
              </div>
              <Select value={readReceipts} onValueChange={setReadReceipts}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="always">Always</SelectItem>
                  <SelectItem value="ask">Ask</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Spell Check</Label>
                <p className="text-sm text-muted-foreground">
                  Check spelling while composing emails
                </p>
              </div>
              <Switch checked={spellCheck} onCheckedChange={setSpellCheck} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Auto-save Drafts</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically save drafts while composing
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={autoSave} onCheckedChange={setAutoSave} />
                {autoSave && (
                  <Select
                    value={autoSaveInterval}
                    onValueChange={setAutoSaveInterval}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10s</SelectItem>
                      <SelectItem value="30">30s</SelectItem>
                      <SelectItem value="60">1m</SelectItem>
                      <SelectItem value="300">5m</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>

          <Button onClick={handleSaveMailSettings}>Save Preferences</Button>
        </CardContent>
      </Card>

      {/* Out-of-Office */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Out-of-Office Auto-Reply
          </CardTitle>
          <CardDescription>
            Set up automatic replies when you're away from the office.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Enable Out-of-Office</Label>
              <p className="text-sm text-muted-foreground">
                Automatically send replies to incoming emails
              </p>
            </div>
            <Switch checked={oooEnabled} onCheckedChange={setOooEnabled} />
          </div>

          {oooEnabled && (
            <>
              <Separator />

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="oooStartDate">Start Date</Label>
                    <Input
                      id="oooStartDate"
                      type="date"
                      value={oooStartDate}
                      onChange={(e) => setOooStartDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="oooEndDate">End Date</Label>
                    <Input
                      id="oooEndDate"
                      type="date"
                      value={oooEndDate}
                      onChange={(e) => setOooEndDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>External Contacts Only</Label>
                    <p className="text-sm text-muted-foreground">
                      Only send auto-replies to external email addresses
                    </p>
                  </div>
                  <Switch
                    checked={oooExternalOnly}
                    onCheckedChange={setOooExternalOnly}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="oooMessage">Auto-Reply Message</Label>
                  <Textarea
                    id="oooMessage"
                    value={oooMessage}
                    onChange={(e) => setOooMessage(e.target.value)}
                    placeholder="Enter your out-of-office message..."
                    rows={4}
                  />
                </div>

                {!oooExternalOnly && (
                  <div className="space-y-2">
                    <Label htmlFor="oooInternalMessage">
                      Internal Message (Optional)
                    </Label>
                    <Textarea
                      id="oooInternalMessage"
                      value={oooInternalMessage}
                      onChange={(e) => setOooInternalMessage(e.target.value)}
                      placeholder="Different message for internal contacts..."
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave empty to use the same message for internal contacts
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          <Button onClick={handleSaveOOO}>
            {oooEnabled ? "Update" : "Save"} Out-of-Office
          </Button>
        </CardContent>
      </Card>

      {/* Signature Dialog */}
      <Dialog open={showSignatureDialog} onOpenChange={setShowSignatureDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingSignature ? "Edit Signature" : "Create New Signature"}
            </DialogTitle>
            <DialogDescription>
              Configure your email signature settings
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signatureName">Signature Name</Label>
              <Input
                id="signatureName"
                value={signatureForm.name}
                onChange={(e) =>
                  setSignatureForm((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                placeholder="e.g., Work, Personal, Marketing"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signatureContent">Signature Content</Label>
              <Textarea
                id="signatureContent"
                value={signatureForm.content}
                onChange={(e) =>
                  setSignatureForm((prev) => ({
                    ...prev,
                    content: e.target.value,
                  }))
                }
                placeholder="Enter your signature content..."
                rows={6}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Set as Default</Label>
                <Switch
                  checked={signatureForm.isDefault}
                  onCheckedChange={(checked) =>
                    setSignatureForm((prev) => ({
                      ...prev,
                      isDefault: checked,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Use for Replies</Label>
                <Switch
                  checked={signatureForm.useForReply}
                  onCheckedChange={(checked) =>
                    setSignatureForm((prev) => ({
                      ...prev,
                      useForReply: checked,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Use for Forwards</Label>
                <Switch
                  checked={signatureForm.useForForward}
                  onCheckedChange={(checked) =>
                    setSignatureForm((prev) => ({
                      ...prev,
                      useForForward: checked,
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSignatureDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveSignature}
              disabled={!signatureForm.name || !signatureForm.content}
            >
              <Save className="mr-2 h-4 w-4" />
              {editingSignature ? "Update" : "Create"} Signature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : "Create New Template"}
            </DialogTitle>
            <DialogDescription>
              Create a reusable email template
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="templateName">Template Name</Label>
                <Input
                  id="templateName"
                  value={templateForm.name}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  placeholder="e.g., Welcome Email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="templateCategory">Category</Label>
                <Select
                  value={templateForm.category}
                  onValueChange={(value) =>
                    setTemplateForm((prev) => ({ ...prev, category: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="welcome">Welcome</SelectItem>
                    <SelectItem value="follow-up">Follow-up</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="support">Support</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="hr">HR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="templateSubject">Email Subject</Label>
              <Input
                id="templateSubject"
                value={templateForm.subject}
                onChange={(e) =>
                  setTemplateForm((prev) => ({
                    ...prev,
                    subject: e.target.value,
                  }))
                }
                placeholder="Subject line for emails using this template"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="templateContent">Email Content</Label>
              <Textarea
                id="templateContent"
                value={templateForm.content}
                onChange={(e) =>
                  setTemplateForm((prev) => ({
                    ...prev,
                    content: e.target.value,
                  }))
                }
                placeholder="Email content... Use [Name] for placeholders"
                rows={8}
              />
              <p className="text-xs text-muted-foreground">
                Use [Name], [Company], [Date] etc. as placeholders that can be
                filled when using the template
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowTemplateDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={
                !templateForm.name ||
                !templateForm.subject ||
                !templateForm.content
              }
            >
              <Save className="mr-2 h-4 w-4" />
              {editingTemplate ? "Update" : "Create"} Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
