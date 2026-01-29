import { DomainDetailPage } from "@/components/admin/domains/DomainDetailPage";

interface DomainDetailRouteProps {
  params: {
    id: string;
  };
}

export default function AdminDomainDetailPage({ params }: DomainDetailRouteProps) {
  return <DomainDetailPage domainId={params.id} />;
}
