import { use } from "react";
import { DomainDetailPage } from "@/components/admin/domains/DomainDetailPage";

interface DomainDetailRouteProps {
  params: Promise<{
    id: string;
  }>;
}

export default function AdminDomainDetailPage({ params }: DomainDetailRouteProps) {
  const { id } = use(params);
  return <DomainDetailPage domainId={id} />;
}
