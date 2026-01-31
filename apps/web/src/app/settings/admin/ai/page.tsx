import { AdminAISettingsPage } from "@/components/ai";

export const metadata = {
  title: "Organization AI Settings | Enterprise Email Admin",
  description: "Configure AI capabilities and restrictions for your organization",
};

export default function AdminAISettingsRoute() {
  // FUTURE: Get orgId from auth context and verify admin access
  const orgId = "org-placeholder";

  return <AdminAISettingsPage orgId={orgId} />;
}
