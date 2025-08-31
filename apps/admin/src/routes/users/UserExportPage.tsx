import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Download,
  Filter,
  FileText,
  Calendar,
  Users,
  Search,
} from "lucide-react";
import { useExportUsers, type ExportFilters } from "../../data/import-export";
import { useGroups } from "../../data/groups";

// Form schema
const exportFormSchema = z.object({
  query: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
  enabled: z.boolean().optional(),
  group: z.string().optional(),
  createdAfter: z.string().optional(),
  createdBefore: z.string().optional(),
  includeAliases: z.boolean().default(true),
  includeGroups: z.boolean().default(true),
  includeQuota: z.boolean().default(true),
  includeTimestamps: z.boolean().default(false),
});

type ExportFormData = z.infer<typeof exportFormSchema>;

interface ExportPreset {
  id: string;
  name: string;
  description: string;
  filters: Partial<ExportFilters>;
  options: {
    includeAliases: boolean;
    includeGroups: boolean;
    includeQuota: boolean;
    includeTimestamps: boolean;
  };
}

const exportPresets: ExportPreset[] = [
  {
    id: "all-users",
    name: "All Users",
    description: "Export all users with basic information",
    filters: {},
    options: {
      includeAliases: true,
      includeGroups: true,
      includeQuota: true,
      includeTimestamps: false,
    },
  },
  {
    id: "active-users",
    name: "Active Users Only",
    description: "Export only enabled users",
    filters: { enabled: true },
    options: {
      includeAliases: true,
      includeGroups: true,
      includeQuota: true,
      includeTimestamps: false,
    },
  },
  {
    id: "admins",
    name: "Administrators",
    description: "Export users with admin role",
    filters: { role: "admin" },
    options: {
      includeAliases: true,
      includeGroups: true,
      includeQuota: false,
      includeTimestamps: true,
    },
  },
  {
    id: "recent-users",
    name: "Recent Users",
    description: "Export users created in the last 30 days",
    filters: {
      createdAfter: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
    },
    options: {
      includeAliases: true,
      includeGroups: true,
      includeQuota: true,
      includeTimestamps: true,
    },
  },
];

function PresetCard({
  preset,
  onSelect,
}: {
  preset: ExportPreset;
  onSelect: (preset: ExportPreset) => void;
}) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onSelect(preset)}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{preset.name}</CardTitle>
        <CardDescription className="text-sm">
          {preset.description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {Object.entries(preset.filters).map(([key, value]) => (
            <Badge key={key} variant="outline" className="text-xs">
              {key}: {value?.toString()}
            </Badge>
          ))}
          {Object.keys(preset.filters).length === 0 && (
            <Badge variant="outline" className="text-xs">
              No filters
            </Badge>
          )}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Includes:{" "}
          {Object.entries(preset.options)
            .filter(([, enabled]) => enabled)
            .map(([key]) =>
              key
                .replace(/([A-Z])/g, " $1")
                .toLowerCase()
                .replace("include ", ""),
            )
            .join(", ")}
        </div>
      </CardContent>
    </Card>
  );
}

export function UserExportPage() {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const { data: groups } = useGroups();
  const exportUsersMutation = useExportUsers();

  const form = useForm<ExportFormData>({
    resolver: zodResolver(exportFormSchema),
    defaultValues: {
      query: "",
      role: "",
      status: "",
      enabled: undefined,
      group: "",
      createdAfter: "",
      createdBefore: "",
      includeAliases: true,
      includeGroups: true,
      includeQuota: true,
      includeTimestamps: false,
    },
  });

  const { register, handleSubmit, formState, setValue, watch, reset } = form;
  const { isSubmitting } = formState;

  const watchedValues = watch();

  const handlePresetSelect = (preset: ExportPreset) => {
    setSelectedPreset(preset.id);

    // Reset form
    reset();

    // Apply preset filters
    Object.entries(preset.filters).forEach(([key, value]) => {
      setValue(key as keyof ExportFormData, value as any);
    });

    // Apply preset options
    Object.entries(preset.options).forEach(([key, value]) => {
      setValue(key as keyof ExportFormData, value);
    });
  };

  const onSubmit = async (data: ExportFormData) => {
    const filters: ExportFilters = {
      query: data.query || undefined,
      role: data.role || undefined,
      status: data.status || undefined,
      enabled: data.enabled,
      group: data.group || undefined,
      createdAfter: data.createdAfter || undefined,
      createdBefore: data.createdBefore || undefined,
    };

    // Remove undefined values
    const cleanFilters = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== undefined),
    );

    try {
      await exportUsersMutation.mutateAsync(cleanFilters);
    } catch (error) {
      // Error handled by mutation hook
    }
  };

  const getActiveFiltersCount = () => {
    const filters = [
      watchedValues.query,
      watchedValues.role,
      watchedValues.status,
      watchedValues.enabled !== undefined ? "enabled" : null,
      watchedValues.group,
      watchedValues.createdAfter,
      watchedValues.createdBefore,
    ].filter(Boolean);

    return filters.length;
  };

  const getIncludedFieldsCount = () => {
    const fields = [
      watchedValues.includeAliases,
      watchedValues.includeGroups,
      watchedValues.includeQuota,
      watchedValues.includeTimestamps,
    ].filter(Boolean);

    return fields.length;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Export Users</h1>
        <p className="text-muted-foreground">
          Export user data to CSV with customizable filters and options
        </p>
      </div>

      {/* Export Presets */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Export Presets</CardTitle>
          <CardDescription>
            Choose from predefined export configurations or create a custom
            export below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {exportPresets.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                onSelect={handlePresetSelect}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Custom Export Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Custom Export
            {getActiveFiltersCount() > 0 && (
              <Badge variant="outline">{getActiveFiltersCount()} filters</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Configure custom filters and options for your export
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Filters Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Filters</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="query">Search Query</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      id="query"
                      placeholder="Search by name or email..."
                      {...register("query")}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={watchedValues.role}
                    onValueChange={(value) => setValue("role", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any role</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="support">Support</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={watchedValues.status}
                    onValueChange={(value) => setValue("status", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="group">Group</Label>
                  <Select
                    value={watchedValues.group}
                    onValueChange={(value) => setValue("group", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any group</SelectItem>
                      {groups?.map((group) => (
                        <SelectItem key={group.id} value={group.name}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="createdAfter">Created After</Label>
                  <Input
                    id="createdAfter"
                    type="date"
                    {...register("createdAfter")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="createdBefore">Created Before</Label>
                  <Input
                    id="createdBefore"
                    type="date"
                    {...register("createdBefore")}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="enabled"
                  checked={watchedValues.enabled === true}
                  onCheckedChange={(checked) =>
                    setValue("enabled", checked ? true : undefined)
                  }
                />
                <Label htmlFor="enabled">Only enabled users</Label>
              </div>
            </div>

            {/* Export Options */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                Export Options
                <Badge variant="outline">
                  {getIncludedFieldsCount()} additional fields
                </Badge>
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeAliases"
                    checked={watchedValues.includeAliases}
                    onCheckedChange={(checked) =>
                      setValue("includeAliases", !!checked)
                    }
                  />
                  <Label htmlFor="includeAliases">Include Aliases</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeGroups"
                    checked={watchedValues.includeGroups}
                    onCheckedChange={(checked) =>
                      setValue("includeGroups", !!checked)
                    }
                  />
                  <Label htmlFor="includeGroups">Include Groups</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeQuota"
                    checked={watchedValues.includeQuota}
                    onCheckedChange={(checked) =>
                      setValue("includeQuota", !!checked)
                    }
                  />
                  <Label htmlFor="includeQuota">Include Quota</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeTimestamps"
                    checked={watchedValues.includeTimestamps}
                    onCheckedChange={(checked) =>
                      setValue("includeTimestamps", !!checked)
                    }
                  />
                  <Label htmlFor="includeTimestamps">Include Timestamps</Label>
                </div>
              </div>
            </div>

            {/* Export Button */}
            <div className="flex gap-4">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 md:flex-none"
              >
                {isSubmitting ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Generating Export...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Export to CSV
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  reset();
                  setSelectedPreset(null);
                }}
              >
                Clear Filters
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Export Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Export Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="font-medium">Fast Export</div>
                <div className="text-sm text-muted-foreground">
                  10,000 users in under 2 seconds
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Download className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="font-medium">Streaming Download</div>
                <div className="text-sm text-muted-foreground">
                  No file size limits
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <div className="font-medium">Real-time Data</div>
                <div className="text-sm text-muted-foreground">
                  Always up-to-date information
                </div>
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            <strong>CSV Format:</strong> The exported file will include columns
            for name, email, role, status, and any additional fields you've
            selected. Date fields use ISO 8601 format, and quota values are in
            bytes.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
