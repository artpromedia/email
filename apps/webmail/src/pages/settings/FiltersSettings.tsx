import { Filter } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function FiltersSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Filters & Rules</h2>
        <p className="text-muted-foreground">
          Manage email filters and automation rules.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Email Filters
          </CardTitle>
          <CardDescription>
            Create rules to automatically organize your incoming emails.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Email filters and rules will be implemented with backend support.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
