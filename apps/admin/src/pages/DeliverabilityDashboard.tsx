import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { PendingButton } from "../components/ui/pending-button";
import { Badge } from "../components/ui/badge";
import {
  RefreshCw,
  Copy,
  CheckCircle,
  AlertTriangle,
  XCircle,
  TrendingUp,
  Shield,
  Mail,
} from "lucide-react";
// import { useAdminAuth } from '../contexts/AdminAuthContext' // TODO: Use for real API calls

interface DNSRecord {
  type: "MX" | "SPF" | "DKIM" | "DMARC" | "MTA-STS" | "TLS-RPT";
  name: string;
  value: string;
  status: "configured" | "missing" | "error" | "pending";
  lastChecked: string;
}

interface DKIMKey {
  selector: string;
  publicKey: string;
  privateKey: string;
  createdAt: string;
  status: "active" | "pending" | "expired";
}

interface DeliverabilityMetrics {
  dmarcPassRate: number;
  tlsReportCount: number;
  reputationScore: number;
  trend: "up" | "down" | "stable";
}

function DeliverabilityDashboard() {
  // const { client } = useAdminAuth() // TODO: Use for real API calls
  const [dnsRecords, setDnsRecords] = useState<DNSRecord[]>([]);
  const [dkimKeys, setDkimKeys] = useState<DKIMKey[]>([]);
  const [metrics, setMetrics] = useState<DeliverabilityMetrics | null>(null);
  const [isRotatingDKIM, setIsRotatingDKIM] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState("ceerion.com");

  useEffect(() => {
    loadDNSRecords();
    loadDKIMKeys();
    loadMetrics();
  }, [selectedDomain]);

  const loadDNSRecords = () => {
    // Mock DNS records - in real implementation, fetch from API
    const mockRecords: DNSRecord[] = [
      {
        type: "MX",
        name: selectedDomain,
        value: "10 mail.ceerion.com",
        status: "configured",
        lastChecked: new Date().toISOString(),
      },
      {
        type: "SPF",
        name: selectedDomain,
        value: "v=spf1 include:_spf.ceerion.com ~all",
        status: "configured",
        lastChecked: new Date().toISOString(),
      },
      {
        type: "DKIM",
        name: `selector1._domainkey.${selectedDomain}`,
        value:
          "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...",
        status: "configured",
        lastChecked: new Date().toISOString(),
      },
      {
        type: "DMARC",
        name: `_dmarc.${selectedDomain}`,
        value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@ceerion.com",
        status: "configured",
        lastChecked: new Date().toISOString(),
      },
      {
        type: "MTA-STS",
        name: `_mta-sts.${selectedDomain}`,
        value: "v=STSv1; id=20240828120000",
        status: "missing",
        lastChecked: new Date().toISOString(),
      },
      {
        type: "TLS-RPT",
        name: `_smtp._tls.${selectedDomain}`,
        value: "v=TLSRPTv1; rua=mailto:tlsrpt@ceerion.com",
        status: "configured",
        lastChecked: new Date().toISOString(),
      },
    ];
    setDnsRecords(mockRecords);
  };

  const loadDKIMKeys = () => {
    // Mock DKIM keys
    const mockKeys: DKIMKey[] = [
      {
        selector: "selector1",
        publicKey: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...",
        privateKey: "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...",
        createdAt: "2024-08-01T00:00:00Z",
        status: "active",
      },
    ];
    setDkimKeys(mockKeys);
  };

  const loadMetrics = () => {
    // Mock metrics - in real implementation, aggregate from DMARC/TLS reports
    const mockMetrics: DeliverabilityMetrics = {
      dmarcPassRate: 97.8,
      tlsReportCount: 1247,
      reputationScore: 98.5,
      trend: "up",
    };
    setMetrics(mockMetrics);
  };

  const rotateDKIM = async () => {
    setIsRotatingDKIM(true);
    try {
      // Mock DKIM rotation - in real implementation, call API
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const newSelector = `selector${Date.now()}`;
      const newKey: DKIMKey = {
        selector: newSelector,
        publicKey: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...",
        privateKey: "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...",
        createdAt: new Date().toISOString(),
        status: "pending",
      };

      setDkimKeys((prev) => [...prev, newKey]);

      // Update DNS record
      setDnsRecords((prev) =>
        prev.map((record) =>
          record.type === "DKIM"
            ? {
                ...record,
                name: `${newSelector}._domainkey.${selectedDomain}`,
                status: "pending" as const,
              }
            : record,
        ),
      );

      // Log the action (in real implementation, send to audit log)
      console.log(
        `DKIM rotated for domain ${selectedDomain}, new selector: ${newSelector}`,
      );
    } finally {
      setIsRotatingDKIM(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // In real implementation, show toast notification
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "configured":
      case "active":
        return "bg-green-100 text-green-800";
      case "missing":
      case "error":
        return "bg-red-100 text-red-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "configured":
      case "active":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "missing":
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "pending":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Deliverability Dashboard
          </h1>
          <p className="text-gray-600">
            Monitor DNS configuration and email reputation
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            className="px-3 py-2 border rounded-md"
          >
            <option value="ceerion.com">ceerion.com</option>
            <option value="example.com">example.com</option>
          </select>
        </div>
      </div>

      {/* Metrics Overview */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                DMARC Pass Rate
              </CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.dmarcPassRate}%</div>
              <p className="text-xs text-green-600">
                {metrics.trend === "up"
                  ? "↗"
                  : metrics.trend === "down"
                    ? "↘"
                    : "→"}{" "}
                From last week
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">TLS Reports</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics.tlsReportCount.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Reputation Score
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics.reputationScore}%
              </div>
              <p className="text-xs text-green-600">Excellent standing</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* DNS Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>DNS Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dnsRecords.map((record, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Badge className={getStatusColor(record.status)}>
                      {record.type}
                    </Badge>
                    {getStatusIcon(record.status)}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(record.value)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="text-sm">
                  <div className="font-medium text-gray-900">{record.name}</div>
                  <div className="text-gray-600 font-mono text-xs mt-1 break-all">
                    {record.value}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* DKIM Management */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>DKIM Keys</CardTitle>
            <PendingButton
              onClick={rotateDKIM}
              isPending={isRotatingDKIM}
              size="sm"
              pendingText="Rotating..."
              loadingIcon={<RefreshCw className="h-4 w-4 animate-spin" />}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Rotate DKIM
            </PendingButton>
          </CardHeader>
          <CardContent className="space-y-4">
            {dkimKeys.map((key, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">
                      Selector: {key.selector}
                    </span>
                    <Badge className={getStatusColor(key.status)}>
                      {key.status}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(key.publicKey)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="text-xs text-gray-500">
                  Created: {new Date(key.createdAt).toLocaleDateString()}
                </div>
                <div className="text-xs text-gray-600 font-mono mt-2 break-all">
                  {key.publicKey.substring(0, 60)}...
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* DNS Copy Snippets */}
      <Card>
        <CardHeader>
          <CardTitle>DNS Setup Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">
                Add these DNS records to your domain:
              </h4>
              <div className="space-y-2">
                {dnsRecords.map((record, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="font-mono">
                      {record.type} {record.name} {record.value}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        copyToClipboard(
                          `${record.type} ${record.name} ${record.value}`,
                        )
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default DeliverabilityDashboard;
