import { useState } from "react";
import { HardDrive, Download, Trash2, Gauge } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function StorageSettings() {
  const { toast } = useToast();

  const [storageUsed] = useState(2.4); // GB
  const [storageLimit] = useState(15); // GB
  const storagePercentage = (storageUsed / storageLimit) * 100;

  const handleExportData = () => {
    toast({
      title: "Export initiated",
      description: "Your data export will be ready for download shortly.",
    });
  };

  const handleDeleteAccount = () => {
    toast({
      title: "Account deletion scheduled",
      description:
        "Your account will be deleted in 30 days. You'll receive a confirmation email.",
      variant: "destructive",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Storage & Data</h2>
        <p className="text-muted-foreground">
          Manage your storage usage and data export options.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Storage Usage
          </CardTitle>
          <CardDescription>Monitor your account storage usage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Used: {storageUsed} GB</span>
              <span>Total: {storageLimit} GB</span>
            </div>
            <Progress value={storagePercentage} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {(storageLimit - storageUsed).toFixed(1)} GB remaining
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="text-center">
              <Gauge className="h-8 w-8 mx-auto mb-2 text-blue-500" />
              <p className="text-sm font-medium">Emails</p>
              <p className="text-xs text-muted-foreground">1.8 GB</p>
            </div>
            <div className="text-center">
              <HardDrive className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p className="text-sm font-medium">Attachments</p>
              <p className="text-xs text-muted-foreground">0.6 GB</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Data Export
          </CardTitle>
          <CardDescription>
            Download a copy of your data for backup or migration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Export your emails, contacts, and settings as a compressed
              archive. This process may take several minutes for large
              mailboxes.
            </p>
            <Button onClick={handleExportData} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Export My Data
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Delete Account
          </CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. Your account will be scheduled for
              deletion and you'll have 30 days to cancel before permanent
              removal.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete My Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action will schedule your account for deletion. All
                    your emails, contacts, and settings will be permanently
                    removed after 30 days. You can cancel this action within
                    that timeframe.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    Delete Account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
