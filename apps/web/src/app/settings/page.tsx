/**
 * Settings Index Page - Redirect to account settings
 */

import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/settings/account");
}
