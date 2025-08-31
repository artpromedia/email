import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  getEmailPolicies, 
  getEmailPolicyStats, 
  toggleEmailPolicyStatus,
  deleteEmailPolicy,
  type EmailPolicy, 
  type EmailPolicyFilters,
  type EmailPolicyType,
  type PolicyCategory,
  type PolicyStatus,
  type ConditionField,
  type ConditionOperator,
  type ActionType
} from "../data/emailPolicies";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

import { 
  Search, 
  Plus, 
  Eye, 
  Edit, 
  Trash2, 
  MoreVertical,
  Shield,
  FileText,
  Settings,
  Database,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Activity
} from "lucide-react";

const PolicyManagement: React.FC = () => {
  const [filters, setFilters] = useState<EmailPolicyFilters>({});
  const [selectedPolicy, setSelectedPolicy] = useState<EmailPolicy | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: policies = [], isLoading: isPoliciesLoading, refetch: refetchPolicies } = useQuery({
    queryKey: ["emailPolicies", filters],
    queryFn: () => getEmailPolicies(filters),
  });

  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ["emailPolicyStats"],
    queryFn: getEmailPolicyStats,
  });

  const handleSearch = (value: string) => {
    setFilters(prev => ({ ...prev, search: value }));
  };

  const handleFilterChange = (key: keyof EmailPolicyFilters, value: string) => {
    setFilters(prev => ({ 
      ...prev, 
      [key]: value === "all" ? undefined : value 
    }));
  };

  const handleToggleStatus = async (policy: EmailPolicy) => {
    try {
      await toggleEmailPolicyStatus(policy.id);
      refetchPolicies();
    } catch (error) {
      console.error("Failed to toggle policy status:", error);
    }
  };

  const handleDeletePolicy = async (policy: EmailPolicy) => {
    if (window.confirm(`Are you sure you want to delete policy "${policy.name}"?`)) {
      try {
        await deleteEmailPolicy(policy.id);
        refetchPolicies();
      } catch (error) {
        console.error("Failed to delete policy:", error);
      }
    }
  };

  const getPolicyTypeIcon = (type: EmailPolicyType) => {
    switch (type) {
      case "content_filter":
      case "spam_filter":
      case "virus_filter":
        return <Shield className="h-4 w-4" />;
      case "attachment_filter":
        return <FileText className="h-4 w-4" />;
      case "retention_rule":
        return <Database className="h-4 w-4" />;
      default:
        return <Settings className="h-4 w-4" />;
    }
  };

  const getPolicyStatusBadge = (status: PolicyStatus) => {
    const statusConfig = {
      active: { variant: "default" as const, icon: CheckCircle, color: "text-green-600" },
      inactive: { variant: "secondary" as const, icon: XCircle, color: "text-gray-600" },
      draft: { variant: "outline" as const, icon: Clock, color: "text-yellow-600" },
      archived: { variant: "destructive" as const, icon: AlertTriangle, color: "text-red-600" }
    };

    const config = statusConfig[status];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className={`h-3 w-3 ${config.color}`} />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getCategoryBadge = (category: PolicyCategory) => {
    const categoryConfig = {
      security: { color: "bg-red-100 text-red-800", icon: Shield },
      compliance: { color: "bg-blue-100 text-blue-800", icon: FileText },
      content: { color: "bg-yellow-100 text-yellow-800", icon: Eye },
      routing: { color: "bg-green-100 text-green-800", icon: Activity },
      storage: { color: "bg-purple-100 text-purple-800", icon: Database }
    };

    const config = categoryConfig[category];
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="h-3 w-3" />
        {category.charAt(0).toUpperCase() + category.slice(1)}
      </span>
    );
  };

  const PolicyDetailsModal = ({ policy }: { policy: EmailPolicy }) => (
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {getPolicyTypeIcon(policy.type)}
          {policy.name}
        </DialogTitle>
        <DialogDescription>{policy.description}</DialogDescription>
      </DialogHeader>
      
      <div className="space-y-6">
        {/* Policy Information */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="font-semibold mb-2">Basic Information</h4>
            <div className="space-y-2 text-sm">
              <div><span className="font-medium">Type:</span> {policy.type.replace(/_/g, ' ')}</div>
              <div><span className="font-medium">Category:</span> {getCategoryBadge(policy.category)}</div>
              <div><span className="font-medium">Status:</span> {getPolicyStatusBadge(policy.status)}</div>
              <div><span className="font-medium">Priority:</span> {policy.priority}</div>
              <div><span className="font-medium">Applied Count:</span> {policy.appliedCount.toLocaleString()}</div>
            </div>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Metadata</h4>
            <div className="space-y-2 text-sm">
              <div><span className="font-medium">Created:</span> {policy.createdAt.toLocaleDateString()}</div>
              <div><span className="font-medium">Updated:</span> {policy.updatedAt.toLocaleDateString()}</div>
              <div><span className="font-medium">Created By:</span> {policy.createdBy}</div>
              <div><span className="font-medium">Modified By:</span> {policy.lastModifiedBy}</div>
              <div><span className="font-medium">System Policy:</span> {policy.isSystemPolicy ? "Yes" : "No"}</div>
            </div>
          </div>
        </div>

        {/* Conditions */}
        <div>
          <h4 className="font-semibold mb-2">Conditions</h4>
          <div className="space-y-2">
            {policy.conditions.map((condition) => (
              <div key={condition.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="text-sm">
                  <span className="font-medium">{condition.field.replace(/_/g, ' ')}</span>
                  <span className="mx-2 text-gray-600">{condition.operator.replace(/_/g, ' ')}</span>
                  <span className="font-mono bg-gray-200 px-2 py-1 rounded">
                    {Array.isArray(condition.value) ? condition.value.join(', ') : String(condition.value)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div>
          <h4 className="font-semibold mb-2">Actions</h4>
          <div className="space-y-2">
            {policy.actions.map((action) => (
              <div key={action.id} className="p-3 bg-blue-50 rounded-lg">
                <div className="text-sm">
                  <span className="font-medium">{action.type.replace(/_/g, ' ')}</span>
                  {Object.keys(action.parameters).length > 0 && (
                    <div className="mt-1 text-xs text-gray-600">
                      {JSON.stringify(action.parameters, null, 2)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Additional Metadata */}
        {Object.keys(policy.metadata).length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Additional Information</h4>
            <div className="p-3 bg-gray-50 rounded-lg">
              <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                {JSON.stringify(policy.metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </DialogContent>
  );

  const CreatePolicyModal = () => {
    const [formData, setFormData] = useState({
      name: "",
      description: "",
      type: "" as EmailPolicyType | "",
      category: "" as PolicyCategory | "",
      priority: 5,
      conditionField: "" as ConditionField | "",
      conditionOperator: "" as ConditionOperator | "",
      conditionValue: "",
      actionType: "" as ActionType | "",
    });

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      
      if (!formData.name || !formData.type || !formData.category || !formData.conditionField || !formData.actionType) {
        alert("Please fill in all required fields");
        return;
      }

      // Create new policy object
      const newPolicy: EmailPolicy = {
        id: `policy-${Date.now()}`,
        name: formData.name,
        description: formData.description,
        type: formData.type as EmailPolicyType,
        category: formData.category as PolicyCategory,
        status: "draft",
        priority: formData.priority,
        conditions: [
          {
            id: `cond-${Date.now()}`,
            field: formData.conditionField as ConditionField,
            operator: formData.conditionOperator as ConditionOperator || "equals",
            value: formData.conditionValue,
          }
        ],
        actions: [
          {
            id: `act-${Date.now()}`,
            type: formData.actionType as ActionType,
            parameters: {},
            order: 1,
          }
        ],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "admin@ceerion.com",
        lastModifiedBy: "admin@ceerion.com",
        isSystemPolicy: false,
        appliedCount: 0,
      };

      console.log("Creating new policy:", newPolicy);
      alert(`Policy "${formData.name}" created successfully! (This is a demo - policy would be saved to database)`);
      
      // Reset form and close modal
      setFormData({
        name: "",
        description: "",
        type: "" as EmailPolicyType | "",
        category: "" as PolicyCategory | "",
        priority: 5,
        conditionField: "" as ConditionField | "",
        conditionOperator: "" as ConditionOperator | "",
        conditionValue: "",
        actionType: "" as ActionType | "",
      });
      setShowCreateModal(false);
      refetchPolicies();
    };

    return (
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create New Email Policy
          </DialogTitle>
          <DialogDescription>
            Configure a new email filtering or security policy for your organization
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h4 className="font-semibold">Basic Information</h4>
            
            <div>
              <label className="block text-sm font-medium mb-1">Policy Name *</label>
              <Input
                placeholder="Enter policy name..."
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Input
                placeholder="Describe what this policy does..."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Policy Type *</label>
                <Select value={formData.type} onValueChange={(value) => setFormData(prev => ({ ...prev, type: value as EmailPolicyType }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="content_filter">Content Filter</SelectItem>
                    <SelectItem value="spam_filter">Spam Filter</SelectItem>
                    <SelectItem value="virus_filter">Virus Filter</SelectItem>
                    <SelectItem value="attachment_filter">Attachment Filter</SelectItem>
                    <SelectItem value="sender_filter">Sender Filter</SelectItem>
                    <SelectItem value="recipient_filter">Recipient Filter</SelectItem>
                    <SelectItem value="domain_filter">Domain Filter</SelectItem>
                    <SelectItem value="quarantine_rule">Quarantine Rule</SelectItem>
                    <SelectItem value="delivery_rule">Delivery Rule</SelectItem>
                    <SelectItem value="retention_rule">Retention Rule</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Category *</label>
                <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value as PolicyCategory }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="security">Security</SelectItem>
                    <SelectItem value="compliance">Compliance</SelectItem>
                    <SelectItem value="content">Content</SelectItem>
                    <SelectItem value="routing">Routing</SelectItem>
                    <SelectItem value="storage">Storage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Priority (1-10, lower = higher priority)</label>
              <Input
                type="number"
                min="1"
                max="10"
                value={formData.priority}
                onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 5 }))}
              />
            </div>
          </div>

          {/* Condition */}
          <div className="space-y-4">
            <h4 className="font-semibold">Condition</h4>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Field *</label>
                <Select value={formData.conditionField} onValueChange={(value) => setFormData(prev => ({ ...prev, conditionField: value as ConditionField }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sender_email">Sender Email</SelectItem>
                    <SelectItem value="sender_domain">Sender Domain</SelectItem>
                    <SelectItem value="recipient_email">Recipient Email</SelectItem>
                    <SelectItem value="recipient_domain">Recipient Domain</SelectItem>
                    <SelectItem value="subject">Subject</SelectItem>
                    <SelectItem value="body">Body</SelectItem>
                    <SelectItem value="attachment_name">Attachment Name</SelectItem>
                    <SelectItem value="attachment_type">Attachment Type</SelectItem>
                    <SelectItem value="message_size">Message Size</SelectItem>
                    <SelectItem value="spam_score">Spam Score</SelectItem>
                    <SelectItem value="virus_scan_result">Virus Scan Result</SelectItem>
                    <SelectItem value="sender_reputation">Sender Reputation</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Operator</label>
                <Select value={formData.conditionOperator} onValueChange={(value) => setFormData(prev => ({ ...prev, conditionOperator: value as ConditionOperator }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="equals" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="not_equals">Not Equals</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="not_contains">Not Contains</SelectItem>
                    <SelectItem value="starts_with">Starts With</SelectItem>
                    <SelectItem value="ends_with">Ends With</SelectItem>
                    <SelectItem value="greater_than">Greater Than</SelectItem>
                    <SelectItem value="less_than">Less Than</SelectItem>
                    <SelectItem value="in_list">In List</SelectItem>
                    <SelectItem value="not_in_list">Not In List</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Value</label>
                <Input
                  placeholder="Enter value..."
                  value={formData.conditionValue}
                  onChange={(e) => setFormData(prev => ({ ...prev, conditionValue: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="space-y-4">
            <h4 className="font-semibold">Action</h4>
            
            <div>
              <label className="block text-sm font-medium mb-1">Action Type *</label>
              <Select value={formData.actionType} onValueChange={(value) => setFormData(prev => ({ ...prev, actionType: value as ActionType }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quarantine">Quarantine</SelectItem>
                  <SelectItem value="block">Block</SelectItem>
                  <SelectItem value="allow">Allow</SelectItem>
                  <SelectItem value="tag">Tag</SelectItem>
                  <SelectItem value="forward">Forward</SelectItem>
                  <SelectItem value="encrypt">Encrypt</SelectItem>
                  <SelectItem value="add_header">Add Header</SelectItem>
                  <SelectItem value="remove_header">Remove Header</SelectItem>
                  <SelectItem value="modify_subject">Modify Subject</SelectItem>
                  <SelectItem value="notify_admin">Notify Admin</SelectItem>
                  <SelectItem value="log_event">Log Event</SelectItem>
                  <SelectItem value="delay_delivery">Delay Delivery</SelectItem>
                  <SelectItem value="require_approval">Require Approval</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit">
              Create Policy
            </Button>
          </div>
        </form>
      </DialogContent>
    );
  };

  if (isPoliciesLoading || isStatsLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Email Policy Management</h1>
          <p className="text-gray-600 mt-1">Configure and manage email filtering and security policies</p>
        </div>
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Policy
            </Button>
          </DialogTrigger>
          <CreatePolicyModal />
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Policies</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalPolicies}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.activePolicies} active, {stats?.draftPolicies} drafts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Policies</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.activePolicies}</div>
            <p className="text-xs text-muted-foreground">
              Currently enforced
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recently Modified</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats?.recentlyModified}</div>
            <p className="text-xs text-muted-foreground">
              In the last 30 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Applications</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {stats?.applicationStats[0]?.appliedCount.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.applicationStats[0]?.policyName}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search policies..."
                  className="pl-10"
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
            </div>
            
            <Select onValueChange={(value) => handleFilterChange("type", value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Policy Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="content_filter">Content Filter</SelectItem>
                <SelectItem value="spam_filter">Spam Filter</SelectItem>
                <SelectItem value="virus_filter">Virus Filter</SelectItem>
                <SelectItem value="attachment_filter">Attachment Filter</SelectItem>
                <SelectItem value="sender_filter">Sender Filter</SelectItem>
                <SelectItem value="recipient_filter">Recipient Filter</SelectItem>
                <SelectItem value="domain_filter">Domain Filter</SelectItem>
                <SelectItem value="quarantine_rule">Quarantine Rule</SelectItem>
                <SelectItem value="delivery_rule">Delivery Rule</SelectItem>
                <SelectItem value="retention_rule">Retention Rule</SelectItem>
              </SelectContent>
            </Select>

            <Select onValueChange={(value) => handleFilterChange("category", value)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="security">Security</SelectItem>
                <SelectItem value="compliance">Compliance</SelectItem>
                <SelectItem value="content">Content</SelectItem>
                <SelectItem value="routing">Routing</SelectItem>
                <SelectItem value="storage">Storage</SelectItem>
              </SelectContent>
            </Select>

            <Select onValueChange={(value) => handleFilterChange("status", value)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Policies List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Email Policies ({policies.length})</CardTitle>
          <CardDescription>
            Manage email filtering and security policies for your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {policies.map((policy) => (
              <div key={policy.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    {getPolicyTypeIcon(policy.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{policy.name}</h3>
                      {policy.isSystemPolicy && (
                        <Badge variant="outline" className="text-xs">System</Badge>
                      )}
                      <span className="text-xs text-gray-500">Priority: {policy.priority}</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{policy.description}</p>
                    <div className="flex items-center gap-2">
                      {getCategoryBadge(policy.category)}
                      {getPolicyStatusBadge(policy.status)}
                      <span className="text-xs text-gray-500">
                        Applied {policy.appliedCount.toLocaleString()} times
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleStatus(policy)}
                    className={policy.status === "active" ? "text-red-600 hover:text-red-700" : "text-green-600 hover:text-green-700"}
                  >
                    {policy.status === "active" ? "Deactivate" : "Activate"}
                  </Button>
                  
                  <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedPolicy(policy)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    {selectedPolicy && <PolicyDetailsModal policy={selectedPolicy} />}
                  </Dialog>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Policy
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <FileText className="h-4 w-4 mr-2" />
                        Duplicate Policy
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-red-600"
                        onClick={() => handleDeletePolicy(policy)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Policy
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PolicyManagement;
