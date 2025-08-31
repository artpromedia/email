import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Shield,
  Lock,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { useAdminToast } from "../hooks/useAdminToast";
import { MFAPolicyEditor } from "../components/policies/MFAPolicyEditor";
import { PasswordPolicyEditor } from "../components/policies/PasswordPolicyEditor";
import { ExternalBannerPolicyEditor } from "../components/policies/ExternalBannerPolicyEditor";
import { TrustedSendersPolicyEditor } from "../components/policies/TrustedSendersPolicyEditor";
import {
  MFAPolicy,
  PasswordPolicy,
  ExternalBannerPolicy,
  TrustedSendersPolicy,
  getMFAPolicy,
  updateMFAPolicy,
  getPasswordPolicy,
  updatePasswordPolicy,
  getExternalBannerPolicy,
  updateExternalBannerPolicy,
  getTrustedSendersPolicy,
  addTrustedSender,
  removeTrustedSender,
  importTrustedSendersCSV,
} from "../data/policies";

function PolicyManagement() {
  const toast = useAdminToast();

  // Policy data state
  const [mfaPolicy, setMfaPolicy] = useState<MFAPolicy | null>(null);
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy | null>(
    null,
  );
  const [externalBannerPolicy, setExternalBannerPolicy] =
    useState<ExternalBannerPolicy | null>(null);
  const [trustedSendersPolicy, setTrustedSendersPolicy] =
    useState<TrustedSendersPolicy | null>(null);

  // Editor state
  const [openEditor, setOpenEditor] = useState<
    "mfa" | "password" | "banner" | "trusted" | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load all policies on component mount
  useEffect(() => {
    const loadPolicies = async () => {
      try {
        const [mfa, password, banner, trusted] = await Promise.all([
          getMFAPolicy(),
          getPasswordPolicy(),
          getExternalBannerPolicy(),
          getTrustedSendersPolicy(),
        ]);

        setMfaPolicy(mfa);
        setPasswordPolicy(password);
        setExternalBannerPolicy(banner);
        setTrustedSendersPolicy(trusted);
      } catch (error) {
        toast.error("Failed to load policies");
      } finally {
        setIsLoading(false);
      }
    };

    loadPolicies();
  }, [toast]);

  // Policy update handlers
  const handleUpdateMFAPolicy = async (policy: MFAPolicy) => {
    const updated = await updateMFAPolicy(policy);
    setMfaPolicy(updated);
  };

  const handleUpdatePasswordPolicy = async (policy: PasswordPolicy) => {
    const updated = await updatePasswordPolicy(policy);
    setPasswordPolicy(updated);
  };

  const handleUpdateExternalBannerPolicy = async (
    policy: ExternalBannerPolicy,
  ) => {
    const updated = await updateExternalBannerPolicy(policy);
    setExternalBannerPolicy(updated);
  };

  const handleAddTrustedSender = async (email: string, domain?: string) => {
    if (trustedSendersPolicy) {
      const updated = await addTrustedSender(
        trustedSendersPolicy,
        email,
        domain,
      );
      setTrustedSendersPolicy(updated);
    }
  };

  const handleRemoveTrustedSender = async (id: string) => {
    if (trustedSendersPolicy) {
      const updated = await removeTrustedSender(trustedSendersPolicy, id);
      setTrustedSendersPolicy(updated);
    }
  };

  const handleImportTrustedSendersCSV = async (file: File) => {
    if (trustedSendersPolicy) {
      const result = await importTrustedSendersCSV(trustedSendersPolicy, file);
      setTrustedSendersPolicy(result.policy);
      return { success: result.imported, errors: result.errors };
    }
    return { success: 0, errors: ["Policy not loaded"] };
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Policy Management
          </h1>
          <p className="text-gray-600">Loading policies...</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-gray-200 rounded w-1/3"></div>
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Policy Management</h1>
        <p className="text-gray-600">
          Configure MFA, password rules, and organizational policies
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MFA Settings Card */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setOpenEditor("mfa")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              MFA Settings
            </CardTitle>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Status</span>
                <Badge variant={mfaPolicy?.required ? "default" : "secondary"}>
                  {mfaPolicy?.required ? "Required" : "Optional"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Methods</span>
                <span className="text-sm font-medium">
                  {mfaPolicy?.methods.length || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Grace Period</span>
                <span className="text-sm font-medium">
                  {mfaPolicy?.gracePeriodDays || 0} days
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Password Rules Card */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setOpenEditor("password")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-green-600" />
              Password Rules
            </CardTitle>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Min Length</span>
                <span className="text-sm font-medium">
                  {passwordPolicy?.minLength || 8} chars
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Complexity</span>
                <Badge variant="outline">
                  {
                    [
                      passwordPolicy?.requireUppercase && "A-Z",
                      passwordPolicy?.requireLowercase && "a-z",
                      passwordPolicy?.requireNumbers && "0-9",
                      passwordPolicy?.requireSymbols && "!@#",
                    ].filter(Boolean).length
                  }{" "}
                  rules
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Max Age</span>
                <span className="text-sm font-medium">
                  {passwordPolicy?.maxAgeDays === 0
                    ? "Never"
                    : `${passwordPolicy?.maxAgeDays} days`}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* External Banner Card */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setOpenEditor("banner")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5 text-amber-600" />
              External Banner
            </CardTitle>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Status</span>
                <Badge
                  variant={
                    externalBannerPolicy?.enabled ? "default" : "secondary"
                  }
                >
                  {externalBannerPolicy?.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              {externalBannerPolicy?.enabled && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Type</span>
                    <Badge variant="outline">{externalBannerPolicy.type}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      Exempt Domains
                    </span>
                    <span className="text-sm font-medium">
                      {externalBannerPolicy.exemptDomains.length}
                    </span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Trusted Senders Card */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setOpenEditor("trusted")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Trusted Senders
            </CardTitle>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total Senders</span>
                <Badge variant="outline">
                  {trustedSendersPolicy?.senders.length || 0}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Recent Activity</span>
                <span className="text-sm font-medium">
                  {trustedSendersPolicy?.senders.length
                    ? new Date(
                        Math.max(
                          ...trustedSendersPolicy.senders.map((s) =>
                            new Date(s.addedAt).getTime(),
                          ),
                        ),
                      ).toLocaleDateString()
                    : "None"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Policy Editors */}
      {mfaPolicy && (
        <MFAPolicyEditor
          open={openEditor === "mfa"}
          onClose={() => setOpenEditor(null)}
          policy={mfaPolicy}
          onSave={handleUpdateMFAPolicy}
        />
      )}

      {passwordPolicy && (
        <PasswordPolicyEditor
          open={openEditor === "password"}
          onClose={() => setOpenEditor(null)}
          policy={passwordPolicy}
          onSave={handleUpdatePasswordPolicy}
        />
      )}

      {externalBannerPolicy && (
        <ExternalBannerPolicyEditor
          open={openEditor === "banner"}
          onClose={() => setOpenEditor(null)}
          policy={externalBannerPolicy}
          onSave={handleUpdateExternalBannerPolicy}
        />
      )}

      {trustedSendersPolicy && (
        <TrustedSendersPolicyEditor
          open={openEditor === "trusted"}
          onClose={() => setOpenEditor(null)}
          policy={trustedSendersPolicy}
          onAddSender={handleAddTrustedSender}
          onRemoveSender={handleRemoveTrustedSender}
          onImportCSV={handleImportTrustedSendersCSV}
        />
      )}
    </div>
  );
}

export default PolicyManagement;
