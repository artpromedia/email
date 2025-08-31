import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Shield,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  CheckCircle,
  Trash2,
  UserX,
  AlertTriangle,
  Clock,
  Mail,
  Paperclip,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  getQuarantine,
  getQuarantineStats,
  actOnQuarantine,
  type QuarantineFilters,
} from "../data/quarantine";

export default function QuarantineManagement() {
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [filters, setFilters] = useState<QuarantineFilters>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [viewingMessage, setViewingMessage] = useState<any>(null);

  // Fetch quarantine data
  const { data: messages = [], refetch: refetchMessages } = useQuery({
    queryKey: ["quarantine", filters],
    queryFn: () => getQuarantine(filters),
  });

  const { data: stats } = useQuery({
    queryKey: ["quarantineStats"],
    queryFn: getQuarantineStats,
  });

  // Handle search
  const handleSearch = () => {
    setFilters({ ...filters, search: searchQuery });
  };

  // Handle filter changes
  const handleFilterChange = (key: keyof QuarantineFilters, value: any) => {
    setFilters({ ...filters, [key]: value });
  };

  // Handle message selection
  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessages((prev) =>
      prev.includes(messageId)
        ? prev.filter((id) => id !== messageId)
        : [...prev, messageId],
    );
  };

  const selectAllMessages = () => {
    setSelectedMessages(
      selectedMessages.length === messages.length
        ? []
        : messages.map((msg) => msg.id),
    );
  };

  // Handle actions
  const handleAction = async (
    action: "release" | "delete" | "whitelist",
    messageIds: string[],
  ) => {
    setIsLoading(true);
    try {
      await actOnQuarantine({ action, messageIds });
      setSelectedMessages([]);
      refetchMessages();
      alert(`Successfully ${action}d ${messageIds.length} message(s)`);
    } catch (error) {
      alert(`Failed to ${action} messages`);
    } finally {
      setIsLoading(false);
    }
  };

  // Get reason badge color
  const getReasonBadge = (reason: string) => {
    const colors: Record<string, string> = {
      spam: "bg-yellow-100 text-yellow-800",
      virus: "bg-red-100 text-red-800",
      malware: "bg-red-100 text-red-800",
      phishing: "bg-orange-100 text-orange-800",
      policy: "bg-blue-100 text-blue-800",
      content: "bg-purple-100 text-purple-800",
    };
    return colors[reason] || "bg-gray-100 text-gray-800";
  };

  // Get priority badge color
  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      low: "bg-green-100 text-green-800",
      medium: "bg-yellow-100 text-yellow-800",
      high: "bg-orange-100 text-orange-800",
      critical: "bg-red-100 text-red-800",
    };
    return colors[priority] || "bg-gray-100 text-gray-800";
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Format date
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="h-6 w-6 text-red-600" />
          <h1 className="text-2xl font-bold text-gray-900">
            Quarantine Management
          </h1>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.total}
                  </p>
                </div>
                <Mail className="h-8 w-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Spam</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {stats.spam}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-yellow-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Virus</p>
                  <p className="text-2xl font-bold text-red-600">
                    {stats.virus}
                  </p>
                </div>
                <Shield className="h-8 w-8 text-red-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Policy</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {stats.policy}
                  </p>
                </div>
                <Filter className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Content</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {stats.content}
                  </p>
                </div>
                <Eye className="h-8 w-8 text-purple-400" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Reason Filter */}
            <Select
              value={filters.reason || "all"}
              onValueChange={(value) =>
                handleFilterChange("reason", value === "all" ? "" : value)
              }
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Reasons" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reasons</SelectItem>
                <SelectItem value="spam">Spam</SelectItem>
                <SelectItem value="virus">Virus</SelectItem>
                <SelectItem value="malware">Malware</SelectItem>
                <SelectItem value="phishing">Phishing</SelectItem>
                <SelectItem value="policy">Policy</SelectItem>
                <SelectItem value="content">Content</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={handleSearch} className="px-6">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedMessages.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-900">
                {selectedMessages.length} message(s) selected
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => handleAction("release", selectedMessages)}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Release
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction("delete", selectedMessages)}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction("whitelist", selectedMessages)}
                  disabled={isLoading}
                >
                  <UserX className="h-4 w-4 mr-1" />
                  Block Sender
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Messages Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Quarantined Messages</CardTitle>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={
                  selectedMessages.length === messages.length &&
                  messages.length > 0
                }
                onChange={selectAllMessages}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-600">Select All</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="w-12 px-4 py-3 text-left"></th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900">
                    Subject
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900">
                    From
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900">
                    To
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900">
                    Reason
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900">
                    Priority
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900">
                    Score
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-900">
                    Size
                  </th>
                  <th className="w-16 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {messages.map((message) => (
                  <tr key={message.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedMessages.includes(message.id)}
                        onChange={() => toggleMessageSelection(message.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/quarantine/${message.id}`}
                          className="font-medium text-gray-900 hover:text-blue-600 truncate max-w-64"
                        >
                          {message.subject}
                        </Link>
                        {message.attachmentCount > 0 && (
                          <Paperclip className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate max-w-64">
                        {message.preview}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">
                          {message.from}
                        </p>
                        <p className="text-sm text-gray-500">
                          {message.fromEmail}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">
                          {message.recipient}
                        </p>
                        <p className="text-sm text-gray-500">{message.to[0]}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={getReasonBadge(message.quarantineReason)}
                      >
                        {message.quarantineReason}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={getPriorityBadge(message.priority)}>
                        {message.priority}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{message.score}/10</span>
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-red-600 h-2 rounded-full"
                            style={{ width: `${(message.score / 10) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Clock className="h-4 w-4" />
                        {formatDate(message.quarantinedAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatFileSize(message.size)}
                    </td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setViewingMessage(message)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleAction("release", [message.id])
                            }
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Release
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleAction("delete", [message.id])}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleAction("whitelist", [message.id])
                            }
                          >
                            <UserX className="h-4 w-4 mr-2" />
                            Block Sender
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {messages.length === 0 && (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No quarantined messages
              </h3>
              <p className="text-gray-600">
                All messages are clean and delivered successfully.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message Details Dialog */}
      <Dialog
        open={!!viewingMessage}
        onOpenChange={() => setViewingMessage(null)}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Message Details</DialogTitle>
          </DialogHeader>
          {viewingMessage && (
            <div className="space-y-6">
              {/* Message Overview */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    From:
                  </label>
                  <p className="text-sm font-medium">{viewingMessage.from}</p>
                  <p className="text-xs text-gray-500">
                    {viewingMessage.fromEmail}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    To:
                  </label>
                  <p className="text-sm font-medium">
                    {viewingMessage.recipient}
                  </p>
                  {viewingMessage.to && viewingMessage.to[0] && (
                    <p className="text-xs text-gray-500">
                      {viewingMessage.to[0]}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Subject:
                  </label>
                  <p className="text-sm font-medium">
                    {viewingMessage.subject}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Date:
                  </label>
                  <p className="text-sm">
                    {formatDate(viewingMessage.quarantinedAt)}
                  </p>
                  {viewingMessage.originalDate && (
                    <p className="text-xs text-gray-500">
                      Original: {formatDate(viewingMessage.originalDate)}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Reason:
                  </label>
                  <Badge
                    className={getPriorityBadge(
                      viewingMessage.quarantineReason,
                    )}
                  >
                    {viewingMessage.quarantineReason}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Priority:
                  </label>
                  <Badge className={getPriorityBadge(viewingMessage.priority)}>
                    {viewingMessage.priority}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Score:
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {viewingMessage.score}/10
                    </span>
                    <div className="w-24 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-red-600 h-2 rounded-full"
                        style={{
                          width: `${(viewingMessage.score / 10) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Size:
                  </label>
                  <p className="text-sm">
                    {formatFileSize(viewingMessage.size)}
                  </p>
                  {viewingMessage.attachmentCount > 0 && (
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Paperclip className="h-3 w-3" />
                      {viewingMessage.attachmentCount} attachment(s)
                    </p>
                  )}
                </div>
              </div>

              {/* Message Preview */}
              <div>
                <h3 className="text-lg font-medium mb-2">Message Preview</h3>
                <div className="bg-white border rounded-lg p-4">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {viewingMessage.preview || "No preview available"}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  onClick={() => {
                    handleAction("release", [viewingMessage.id]);
                    setViewingMessage(null);
                  }}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Release Message
                </Button>
                <Button
                  onClick={() => {
                    handleAction("whitelist", [viewingMessage.id]);
                  }}
                  variant="outline"
                >
                  <UserX className="h-4 w-4 mr-2" />
                  Block Sender
                </Button>
                <Button
                  onClick={() => {
                    handleAction("delete", [viewingMessage.id]);
                    setViewingMessage(null);
                  }}
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Message
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
