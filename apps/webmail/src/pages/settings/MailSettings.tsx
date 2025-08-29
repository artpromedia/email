import { useState } from "react";
import {
  Mail,
  FileText,
  Calendar,
  Settings,
  Upload,
  Trash2,
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
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

export function MailSettings() {
  const { toast } = useToast();

  const [defaultSignature, setDefaultSignature] = useState(
    "Best regards,\nJohn Doe\nCEERION Mail",
  );
  const [replyBehavior, setReplyBehavior] = useState("reply");
  const [composeMode, setComposeMode] = useState("rich");
  const [remoteImages, setRemoteImages] = useState("ask");
  const [externalSenderBanner, setExternalSenderBanner] = useState(true);
  const [oooEnabled, setOooEnabled] = useState(false);
  const [oooMessage, setOooMessage] = useState(
    "I'm currently out of office and will respond to your email when I return.",
  );
  const [oooStartDate, setOooStartDate] = useState("");
  const [oooEndDate, setOooEndDate] = useState("");

  const handleSaveSignature = () => {
    toast({
      title: "Signature saved",
      description: "Your default signature has been updated.",
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
          <div className="space-y-2">
            <Label htmlFor="defaultSignature">Default Signature</Label>
            <textarea
              id="defaultSignature"
              value={defaultSignature}
              onChange={(e) => setDefaultSignature(e.target.value)}
              placeholder="Enter your email signature..."
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={handleSaveSignature}>Save Signature</Button>
            <Button variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Import Template
            </Button>
          </div>
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

                <div className="space-y-2">
                  <Label htmlFor="oooMessage">Auto-Reply Message</Label>
                  <textarea
                    id="oooMessage"
                    value={oooMessage}
                    onChange={(e) => setOooMessage(e.target.value)}
                    placeholder="Enter your out-of-office message..."
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </div>
            </>
          )}

          <Button onClick={handleSaveOOO}>
            {oooEnabled ? "Update" : "Save"} Out-of-Office
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
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              No templates created yet
            </p>
            <Button>
              <FileText className="mr-2 h-4 w-4" />
              Create Template
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
