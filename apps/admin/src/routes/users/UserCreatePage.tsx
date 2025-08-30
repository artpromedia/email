import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useAdminToast } from "@/hooks/useAdminToast";
import { ArrowLeft, User, Mail, Shield, HardDrive } from "lucide-react";
import { Link } from "react-router-dom";

// Validation schema
const createUserSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(50, "First name must be 50 characters or less"),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .max(50, "Last name must be 50 characters or less"),
  role: z.enum(["user", "admin"], {
    required_error: "Please select a role",
  }),
  quota: z
    .number()
    .min(100, "Quota must be at least 100 MB")
    .max(10240, "Quota cannot exceed 10 GB"),
  department: z.string().optional(),
  notes: z.string().max(500, "Notes must be 500 characters or less").optional(),
  sendWelcomeEmail: z.boolean().default(true),
  generatePassword: z.boolean().default(true),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

export function UserCreatePage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(
    null,
  );
  const toast = useAdminToast();

  const form = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      role: "user",
      quota: 1024, // 1GB default
      sendWelcomeEmail: true,
      generatePassword: true,
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = form;

  const handleCreateUser = async (data: CreateUserFormData) => {
    setIsSubmitting(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Simulate password generation
      if (data.generatePassword) {
        const password = generateSecurePassword();
        setGeneratedPassword(password);
      }

      toast.success(
        `User ${data.firstName} ${data.lastName} created successfully!`,
      );
    } catch (error) {
      toast.error("Failed to create user. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateSecurePassword = () => {
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Password copied to clipboard!");
  };

  if (generatedPassword) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center space-x-2">
          <Link to="/admin/users" className="text-blue-600 hover:text-blue-800">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-semibold">User Created Successfully</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-green-600">
              ✓ User Account Created
            </CardTitle>
            <CardDescription>
              The user account has been created successfully. Here are the login
              credentials:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email Address</Label>
              <div className="flex items-center space-x-2">
                <Input value={watch("email")} readOnly />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(watch("email"))}
                >
                  Copy
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Temporary Password</Label>
              <div className="flex items-center space-x-2">
                <Input value={generatedPassword} readOnly type="password" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(generatedPassword)}
                >
                  Copy
                </Button>
              </div>
            </div>

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                This password will only be shown once. Make sure to save it
                securely and share it with the user through a secure channel.
                The user will be prompted to change it on first login.
              </AlertDescription>
            </Alert>

            <div className="flex space-x-2 pt-4">
              <Button asChild>
                <Link to="/admin/users">Back to Users</Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setGeneratedPassword(null);
                  form.reset();
                }}
              >
                Create Another User
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="max-w-2xl mx-auto p-6 space-y-6"
      data-testid="create-user-page"
    >
      <div className="flex items-center space-x-2">
        <Link to="/admin/users" className="text-blue-600 hover:text-blue-800">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-2xl font-semibold">Create New User</h1>
      </div>

      <form onSubmit={handleSubmit(handleCreateUser)} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="w-5 h-5" />
              <span>Basic Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  data-testid="first-name-input"
                  {...register("firstName")}
                  placeholder="John"
                />
                {errors.firstName && (
                  <p className="text-sm text-red-600">
                    {errors.firstName.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  data-testid="last-name-input"
                  {...register("lastName")}
                  placeholder="Doe"
                />
                {errors.lastName && (
                  <p className="text-sm text-red-600">
                    {errors.lastName.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                data-testid="email-input"
                {...register("email")}
                placeholder="john.doe@company.com"
              />
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                data-testid="department-input"
                {...register("department")}
                placeholder="Engineering, Sales, Marketing, etc."
              />
            </div>
          </CardContent>
        </Card>

        {/* Permissions & Access */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="w-5 h-5" />
              <span>Permissions & Access</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select
                value={watch("role")}
                onValueChange={(value) =>
                  setValue("role", value as "user" | "admin")
                }
              >
                <SelectTrigger data-testid="role-select">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">
                    <div className="flex items-center space-x-2">
                      <User className="w-4 h-4" />
                      <div>
                        <div className="font-medium">User</div>
                        <div className="text-sm text-gray-500">
                          Standard email access
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center space-x-2">
                      <Shield className="w-4 h-4" />
                      <div>
                        <div className="font-medium">Administrator</div>
                        <div className="text-sm text-gray-500">
                          Full system access
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {errors.role && (
                <p className="text-sm text-red-600">{errors.role.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="quota">Storage Quota (MB) *</Label>
              <Input
                id="quota"
                type="number"
                data-testid="quota-input"
                {...register("quota", { valueAsNumber: true })}
                min="100"
                max="10240"
                step="100"
              />
              <div className="text-sm text-gray-500">
                Current: {watch("quota")}MB (
                {Math.round(((watch("quota") || 0) / 1024) * 100) / 100}GB)
              </div>
              {errors.quota && (
                <p className="text-sm text-red-600">{errors.quota.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Account Setup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Mail className="w-5 h-5" />
              <span>Account Setup</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">
                  Generate Password
                </Label>
                <p className="text-sm text-gray-500">
                  Automatically generate a secure password for the user
                </p>
              </div>
              <input
                type="checkbox"
                data-testid="generate-password-checkbox"
                checked={watch("generatePassword")}
                onChange={(e) => setValue("generatePassword", e.target.checked)}
                className="rounded"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">
                  Send Welcome Email
                </Label>
                <p className="text-sm text-gray-500">
                  Send login instructions and welcome message to the user
                </p>
              </div>
              <input
                type="checkbox"
                data-testid="welcome-email-checkbox"
                checked={watch("sendWelcomeEmail")}
                onChange={(e) => setValue("sendWelcomeEmail", e.target.checked)}
                className="rounded"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Internal Notes</Label>
              <Textarea
                id="notes"
                data-testid="notes-textarea"
                {...register("notes")}
                placeholder="Any internal notes about this user..."
                rows={3}
              />
              {errors.notes && (
                <p className="text-sm text-red-600">{errors.notes.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex space-x-4">
          <Button
            type="submit"
            disabled={isSubmitting}
            data-testid="create-user-button"
            className="min-w-32"
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Creating...
              </>
            ) : (
              "Create User"
            )}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/users">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
