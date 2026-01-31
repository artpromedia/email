import { AISettingsPage } from "@/components/ai";

export const metadata = {
  title: "AI Settings | Enterprise Email",
  description: "Configure AI-powered features for your email workflow",
};

export default function AISettingsRoute() {
  // FUTURE: Get userId and orgId from auth context
  const userId = "user-placeholder";
  const orgId = "org-placeholder";
  const isAdmin = false; // FUTURE: Check if user is admin

  return <AISettingsPage userId={userId} orgId={orgId} isAdmin={isAdmin} />;
}
