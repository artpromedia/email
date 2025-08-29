import { Forward } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ForwardingSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Forwarding & Aliases</h2>
        <p className="text-muted-foreground">
          Manage email forwarding and address aliases.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Forward className="h-5 w-5" />
            Email Forwarding
          </CardTitle>
          <CardDescription>
            Forward emails to external addresses and manage aliases.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Forward className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Email forwarding will be implemented with backend support.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
