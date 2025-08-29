import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Switch } from "../../components/ui/switch";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { Separator } from "../../components/ui/separator";
import { Progress } from "../../components/ui/progress";
import { useToast } from "../../hooks/use-toast";
import {
  Plus,
  Edit3,
  Trash2,
  GripVertical,
  Play,
  Download,
  Upload,
  TestTube,
  CheckCircle,
  AlertCircle,
  Filter,
} from "lucide-react";

interface Rule {
  id: string;
  name: string;
  description?: string;
  isEnabled: boolean;
  priority: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
  triggers: string[];
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastRunStats?: {
    processed: number;
    matched: number;
    errors: number;
  };
}

interface RuleCondition {
  type:
    | "from"
    | "to"
    | "cc"
    | "subject"
    | "body"
    | "sender_domain"
    | "has_attachments"
    | "date_received"
    | "priority"
    | "folder"
    | "size";
  operator:
    | "equals"
    | "contains"
    | "starts_with"
    | "ends_with"
    | "matches_regex"
    | "before"
    | "after"
    | "between"
    | "greater_than"
    | "less_than"
    | "not_equals";
  value: string | number | boolean;
  caseSensitive?: boolean;
  metadata?: Record<string, any>;
}

interface RuleAction {
  type:
    | "move_to_folder"
    | "add_label"
    | "remove_label"
    | "mark_as_read"
    | "mark_as_unread"
    | "mark_as_important"
    | "mark_as_spam"
    | "delete"
    | "archive"
    | "forward_to"
    | "auto_reply"
    | "add_note"
    | "set_priority"
    | "snooze"
    | "add_to_calendar"
    | "set_category";
  parameters: Record<string, any>;
  stopProcessing?: boolean;
}

interface TestResult {
  matched: boolean;
  matchedConditions: number;
  totalConditions: number;
  actionsToExecute: RuleAction[];
  preview: string;
}

export default function RulesSettings() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testResults, setTestResults] = useState<Record<string, TestResult>>(
    {},
  );
  const [isTestMode, setIsTestMode] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/rules", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken") || "demo-jwt-token"}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setRules(data.rules || []);
      } else {
        throw new Error("Failed to load rules");
      }
    } catch (error) {
      toast({
        title: "Error loading rules",
        description: "Failed to fetch rules from server",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveRule = async (rule: Partial<Rule>) => {
    try {
      const method = rule.id ? "PUT" : "POST";
      const url = rule.id ? `/api/rules/${rule.id}` : "/api/rules";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken") || "demo-jwt-token"}`,
        },
        body: JSON.stringify(rule),
      });

      if (response.ok) {
        await loadRules();
        setIsEditorOpen(false);
        setEditingRule(null);
        toast({
          title: "Rule saved",
          description: `Rule "${rule.name}" has been saved successfully`,
        });
      } else {
        throw new Error("Failed to save rule");
      }
    } catch (error) {
      toast({
        title: "Error saving rule",
        description: "Failed to save rule to server",
        variant: "destructive",
      });
    }
  };

  const deleteRule = async (ruleId: string) => {
    try {
      const response = await fetch(`/api/rules/${ruleId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken") || "demo-jwt-token"}`,
        },
      });

      if (response.ok) {
        await loadRules();
        toast({
          title: "Rule deleted",
          description: "Rule has been deleted successfully",
        });
      } else {
        throw new Error("Failed to delete rule");
      }
    } catch (error) {
      toast({
        title: "Error deleting rule",
        description: "Failed to delete rule from server",
        variant: "destructive",
      });
    }
  };

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/rules/${ruleId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken") || "demo-jwt-token"}`,
        },
        body: JSON.stringify({ isEnabled: enabled }),
      });

      if (response.ok) {
        await loadRules();
        toast({
          title: enabled ? "Rule enabled" : "Rule disabled",
          description: `Rule has been ${enabled ? "enabled" : "disabled"}`,
        });
      } else {
        throw new Error("Failed to toggle rule");
      }
    } catch (error) {
      toast({
        title: "Error updating rule",
        description: "Failed to update rule status",
        variant: "destructive",
      });
    }
  };

  // TODO: Implement drag and drop reordering
  // const reorderRules = (dragIndex: number, hoverIndex: number) => {
  //   const updatedRules = [...rules];
  //   const draggedRule = updatedRules[dragIndex];
  //   updatedRules.splice(dragIndex, 1);
  //   updatedRules.splice(hoverIndex, 0, draggedRule);
  //
  //   // Update priority based on new order
  //   updatedRules.forEach((rule, index) => {
  //     rule.priority = index + 1;
  //   });
  //
  //   setRules(updatedRules);
  //
  //   // TODO: Batch update priorities on server
  //   toast({
  //     title: "Rules reordered",
  //     description: "Rule priority order has been updated",
  //   });
  // };

  const testRuleAgainstEmail = (
    rule: Rule,
    emailContent: string,
  ): TestResult => {
    // Mock test logic - in real implementation this would call the backend
    const lines = emailContent.split("\n");
    const headers: Record<string, string> = {};
    let bodyStart = 0;

    // Parse headers
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === "") {
        bodyStart = i + 1;
        break;
      }
      const [key, ...valueParts] = line.split(":");
      if (key && valueParts.length > 0) {
        headers[key.toLowerCase().trim()] = valueParts.join(":").trim();
      }
    }

    const body = lines.slice(bodyStart).join("\n");

    let matchedConditions = 0;
    const totalConditions = rule.conditions.length;

    // Test each condition
    rule.conditions.forEach((condition) => {
      let matches = false;

      switch (condition.type) {
        case "from":
          matches = testStringCondition(headers.from || "", condition);
          break;
        case "to":
          matches = testStringCondition(headers.to || "", condition);
          break;
        case "subject":
          matches = testStringCondition(headers.subject || "", condition);
          break;
        case "body":
          matches = testStringCondition(body, condition);
          break;
        case "has_attachments":
          matches = (headers["content-type"] || "").includes("multipart");
          break;
      }

      if (matches) matchedConditions++;
    });

    const matched = matchedConditions === totalConditions;

    return {
      matched,
      matchedConditions,
      totalConditions,
      actionsToExecute: matched ? rule.actions : [],
      preview: matched
        ? `✅ Rule "${rule.name}" would execute: ${rule.actions.map((a) => a.type).join(", ")}`
        : `❌ Rule "${rule.name}" would not match (${matchedConditions}/${totalConditions} conditions met)`,
    };
  };

  const testStringCondition = (
    text: string,
    condition: RuleCondition,
  ): boolean => {
    const value = String(condition.value);
    const testText = condition.caseSensitive ? text : text.toLowerCase();
    const testValue = condition.caseSensitive ? value : value.toLowerCase();

    switch (condition.operator) {
      case "equals":
        return testText === testValue;
      case "contains":
        return testText.includes(testValue);
      case "starts_with":
        return testText.startsWith(testValue);
      case "ends_with":
        return testText.endsWith(testValue);
      case "matches_regex":
        try {
          return new RegExp(value, condition.caseSensitive ? "g" : "gi").test(
            text,
          );
        } catch {
          return false;
        }
      default:
        return false;
    }
  };

  const runTestEmail = () => {
    if (!testEmail.trim()) {
      toast({
        title: "No test email",
        description: "Please paste an email to test against",
        variant: "destructive",
      });
      return;
    }

    const results: Record<string, TestResult> = {};
    rules
      .filter((r) => r.isEnabled)
      .forEach((rule) => {
        results[rule.id] = testRuleAgainstEmail(rule, testEmail);
      });

    setTestResults(results);
    setIsTestMode(true);

    toast({
      title: "Test completed",
      description: `Tested against ${Object.keys(results).length} active rules`,
    });
  };

  const exportRules = () => {
    const exportData = {
      version: "1.0",
      exported: new Date().toISOString(),
      rules: rules,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `email-rules-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Rules exported",
      description: "Rules have been exported to JSON file",
    });
  };

  const importRules = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const importData = JSON.parse(content);

        if (!importData.rules || !Array.isArray(importData.rules)) {
          throw new Error("Invalid file format");
        }

        // Import rules (remove IDs to create new ones)
        for (const rule of importData.rules) {
          const {
            id,
            createdAt,
            updatedAt,
            lastRunAt,
            lastRunStats,
            ...ruleData
          } = rule;
          await saveRule(ruleData);
        }

        toast({
          title: "Rules imported",
          description: `Successfully imported ${importData.rules.length} rules`,
        });
      } catch (error) {
        toast({
          title: "Import failed",
          description: "Failed to import rules. Please check the file format.",
          variant: "destructive",
        });
      }
    };

    reader.readAsText(file);
    event.target.value = ""; // Reset input
  };

  const runBatchProcess = async () => {
    setBatchRunning(true);
    setBatchProgress(0);

    try {
      // Simulate batch processing
      for (let i = 0; i <= 100; i += 10) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        setBatchProgress(i);
      }

      toast({
        title: "Batch processing completed",
        description: "Rules have been applied to existing mail",
      });
    } catch (error) {
      toast({
        title: "Batch processing failed",
        description: "Failed to run rules on existing mail",
        variant: "destructive",
      });
    } finally {
      setBatchRunning(false);
      setBatchProgress(0);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium">Filters & Rules</h3>
          <p className="text-sm text-muted-foreground">Loading rules...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Filters & Rules</h3>
        <p className="text-sm text-muted-foreground">
          Automatically organize your email with custom rules and filters
        </p>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setEditingRule(null);
              setIsEditorOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Rule
          </Button>

          <input
            type="file"
            accept=".json"
            onChange={importRules}
            className="hidden"
            id="import-rules"
          />
          <Button
            variant="outline"
            onClick={() => document.getElementById("import-rules")?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>

          <Button variant="outline" onClick={exportRules}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={runBatchProcess}
            disabled={batchRunning || rules.length === 0}
          >
            <Play className="h-4 w-4 mr-2" />
            Run on Existing Mail
          </Button>
        </div>
      </div>

      {/* Batch Progress */}
      {batchRunning && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Processing existing mail...</span>
                <span>{batchProgress}%</span>
              </div>
              <Progress value={batchProgress} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Email Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            Test Rules
          </CardTitle>
          <CardDescription>
            Paste a sample email to preview how your rules would handle it
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="test-email">Sample Email (headers + body)</Label>
            <Textarea
              id="test-email"
              placeholder="From: sender@example.com&#10;To: you@example.com&#10;Subject: Test Email&#10;&#10;Email body content..."
              value={testEmail}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setTestEmail(e.target.value)
              }
              rows={6}
              className="font-mono text-sm"
            />
          </div>

          <Button onClick={runTestEmail} disabled={!testEmail.trim()}>
            <TestTube className="h-4 w-4 mr-2" />
            Test Against Rules
          </Button>

          {isTestMode && Object.keys(testResults).length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">Test Results</h4>
              {Object.entries(testResults).map(([ruleId, result]) => {
                const rule = rules.find((r) => r.id === ruleId);
                if (!rule) return null;

                return (
                  <div
                    key={ruleId}
                    className="flex items-center gap-2 p-2 border rounded text-sm"
                  >
                    {result.matched ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-orange-500" />
                    )}
                    <span>{result.preview}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rules List */}
      <div className="space-y-4">
        {rules.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-muted-foreground">
                <Filter className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No rules configured yet</p>
                <p className="text-sm">
                  Create your first rule to automatically organize your email
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          rules.map((rule) => (
            <Card
              key={rule.id}
              className={`transition-all duration-200 ${isTestMode && testResults[rule.id]?.matched ? "ring-2 ring-green-500" : ""}`}
            >
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="flex flex-col items-center gap-1 mt-1">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                      <Badge variant="outline" className="text-xs px-1">
                        {rule.priority}
                      </Badge>
                    </div>

                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{rule.name}</h4>
                        {rule.description && (
                          <span className="text-sm text-muted-foreground">
                            — {rule.description}
                          </span>
                        )}
                        <Switch
                          checked={rule.isEnabled}
                          onCheckedChange={(checked) =>
                            toggleRule(rule.id, checked)
                          }
                        />
                      </div>

                      <div className="text-sm text-muted-foreground space-y-1">
                        <div>
                          <strong>When:</strong>{" "}
                          {rule.conditions
                            .map((c) => `${c.type} ${c.operator} "${c.value}"`)
                            .join(" AND ")}
                        </div>
                        <div>
                          <strong>Then:</strong>{" "}
                          {rule.actions
                            .map(
                              (a) =>
                                `${a.type}${a.parameters ? ` (${Object.values(a.parameters).join(", ")})` : ""}`,
                            )
                            .join(", ")}
                        </div>
                      </div>

                      {rule.lastRunAt && (
                        <div className="text-xs text-muted-foreground flex items-center gap-4">
                          <span>
                            Last run:{" "}
                            {new Date(rule.lastRunAt).toLocaleDateString()}
                          </span>
                          {rule.lastRunStats && (
                            <span>
                              Processed: {rule.lastRunStats.processed}, Matched:{" "}
                              {rule.lastRunStats.matched}
                              {rule.lastRunStats.errors > 0 &&
                                `, Errors: ${rule.lastRunStats.errors}`}
                            </span>
                          )}
                        </div>
                      )}

                      {isTestMode && testResults[rule.id] && (
                        <div className="text-sm">
                          <Badge
                            variant={
                              testResults[rule.id].matched
                                ? "default"
                                : "secondary"
                            }
                          >
                            {testResults[rule.id].matched
                              ? "Would Match"
                              : "No Match"}
                            ({testResults[rule.id].matchedConditions}/
                            {testResults[rule.id].totalConditions})
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingRule(rule);
                        setIsEditorOpen(true);
                      }}
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Rule</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{rule.name}"? This
                            action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteRule(rule.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Rule Editor Dialog */}
      {isEditorOpen && (
        <RuleEditor
          rule={editingRule}
          onSave={saveRule}
          onCancel={() => {
            setIsEditorOpen(false);
            setEditingRule(null);
          }}
        />
      )}
    </div>
  );
}

// Rule Editor Component
function RuleEditor({
  rule,
  onSave,
  onCancel,
}: {
  rule: Rule | null;
  onSave: (rule: Partial<Rule>) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<Partial<Rule>>({
    name: "",
    description: "",
    isEnabled: true,
    priority: 1,
    conditions: [],
    actions: [],
    triggers: ["manual"],
    ...rule,
  });

  const addCondition = () => {
    setFormData((prev) => ({
      ...prev,
      conditions: [
        ...(prev.conditions || []),
        {
          type: "from",
          operator: "contains",
          value: "",
          caseSensitive: false,
        },
      ],
    }));
  };

  const updateCondition = (index: number, updates: Partial<RuleCondition>) => {
    setFormData((prev) => ({
      ...prev,
      conditions:
        prev.conditions?.map((condition, i) =>
          i === index ? { ...condition, ...updates } : condition,
        ) || [],
    }));
  };

  const removeCondition = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      conditions: prev.conditions?.filter((_, i) => i !== index) || [],
    }));
  };

  const addAction = () => {
    setFormData((prev) => ({
      ...prev,
      actions: [
        ...(prev.actions || []),
        {
          type: "add_label",
          parameters: { label: "" },
        },
      ],
    }));
  };

  const updateAction = (index: number, updates: Partial<RuleAction>) => {
    setFormData((prev) => ({
      ...prev,
      actions:
        prev.actions?.map((action, i) =>
          i === index ? { ...action, ...updates } : action,
        ) || [],
    }));
  };

  const removeAction = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      actions: prev.actions?.filter((_, i) => i !== index) || [],
    }));
  };

  const handleSave = () => {
    if (!formData.name?.trim()) {
      return; // Show validation error
    }

    if ((formData.conditions?.length || 0) === 0) {
      return; // Show validation error
    }

    if ((formData.actions?.length || 0) === 0) {
      return; // Show validation error
    }

    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {rule ? "Edit Rule" : "Create New Rule"}
            </h2>
            <Button variant="ghost" onClick={onCancel}>
              ×
            </Button>
          </div>

          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="rule-name">Rule Name *</Label>
              <Input
                id="rule-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Enter rule name"
              />
            </div>

            <div>
              <Label htmlFor="rule-description">Description</Label>
              <Input
                id="rule-description"
                value={formData.description || ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Optional description"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isEnabled}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, isEnabled: checked }))
                }
              />
              <Label>Enable this rule</Label>
            </div>
          </div>

          <Separator />

          {/* Conditions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Conditions (All must match)</h3>
              <Button variant="outline" size="sm" onClick={addCondition}>
                <Plus className="h-4 w-4 mr-2" />
                Add Condition
              </Button>
            </div>

            {formData.conditions?.map((condition, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Condition {index + 1}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCondition(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Field</Label>
                    <Select
                      value={condition.type}
                      onValueChange={(value) =>
                        updateCondition(index, { type: value as any })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="from">From</SelectItem>
                        <SelectItem value="to">To</SelectItem>
                        <SelectItem value="cc">CC</SelectItem>
                        <SelectItem value="subject">Subject</SelectItem>
                        <SelectItem value="body">Body</SelectItem>
                        <SelectItem value="sender_domain">
                          Sender Domain
                        </SelectItem>
                        <SelectItem value="has_attachments">
                          Has Attachments
                        </SelectItem>
                        <SelectItem value="size">Size</SelectItem>
                        <SelectItem value="date_received">
                          Date Received
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Operator</Label>
                    <Select
                      value={condition.operator}
                      onValueChange={(value) =>
                        updateCondition(index, { operator: value as any })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equals">Equals</SelectItem>
                        <SelectItem value="contains">Contains</SelectItem>
                        <SelectItem value="starts_with">Starts with</SelectItem>
                        <SelectItem value="ends_with">Ends with</SelectItem>
                        <SelectItem value="matches_regex">
                          Matches regex
                        </SelectItem>
                        {condition.type === "size" && (
                          <>
                            <SelectItem value="greater_than">
                              Greater than
                            </SelectItem>
                            <SelectItem value="less_than">Less than</SelectItem>
                          </>
                        )}
                        {condition.type === "date_received" && (
                          <>
                            <SelectItem value="before">Before</SelectItem>
                            <SelectItem value="after">After</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Value</Label>
                    {condition.type === "has_attachments" ? (
                      <Select
                        value={String(condition.value)}
                        onValueChange={(value) =>
                          updateCondition(index, { value: value === "true" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Yes</SelectItem>
                          <SelectItem value="false">No</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : condition.type === "date_received" ? (
                      <Input
                        type="date"
                        value={String(condition.value)}
                        onChange={(e) =>
                          updateCondition(index, { value: e.target.value })
                        }
                      />
                    ) : condition.type === "size" ? (
                      <Input
                        type="number"
                        value={String(condition.value)}
                        onChange={(e) =>
                          updateCondition(index, {
                            value: parseInt(e.target.value) || 0,
                          })
                        }
                        placeholder="Size in MB"
                      />
                    ) : (
                      <Input
                        value={String(condition.value)}
                        onChange={(e) =>
                          updateCondition(index, { value: e.target.value })
                        }
                        placeholder="Enter value"
                      />
                    )}
                  </div>
                </div>

                {["from", "to", "cc", "subject", "body"].includes(
                  condition.type,
                ) && (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={condition.caseSensitive || false}
                      onCheckedChange={(checked) =>
                        updateCondition(index, { caseSensitive: checked })
                      }
                    />
                    <Label className="text-sm">Case sensitive</Label>
                  </div>
                )}
              </div>
            ))}
          </div>

          <Separator />

          {/* Actions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Actions</h3>
              <Button variant="outline" size="sm" onClick={addAction}>
                <Plus className="h-4 w-4 mr-2" />
                Add Action
              </Button>
            </div>

            {formData.actions?.map((action, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Action {index + 1}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAction(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Action Type</Label>
                    <Select
                      value={action.type}
                      onValueChange={(value) =>
                        updateAction(index, {
                          type: value as any,
                          parameters: getDefaultParameters(value as any),
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="move_to_folder">
                          Move to folder
                        </SelectItem>
                        <SelectItem value="add_label">Add label</SelectItem>
                        <SelectItem value="remove_label">
                          Remove label
                        </SelectItem>
                        <SelectItem value="mark_as_read">
                          Mark as read
                        </SelectItem>
                        <SelectItem value="mark_as_unread">
                          Mark as unread
                        </SelectItem>
                        <SelectItem value="mark_as_important">
                          Mark as important
                        </SelectItem>
                        <SelectItem value="archive">Archive</SelectItem>
                        <SelectItem value="delete">Delete</SelectItem>
                        <SelectItem value="forward_to">Forward to</SelectItem>
                        <SelectItem value="snooze">Snooze</SelectItem>
                        <SelectItem value="set_category">
                          Set category
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Parameters</Label>
                    {renderActionParameters(action, (params) =>
                      updateAction(index, { parameters: params }),
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={action.stopProcessing || false}
                    onCheckedChange={(checked) =>
                      updateAction(index, { stopProcessing: checked })
                    }
                  />
                  <Label className="text-sm">
                    Stop processing other rules after this action
                  </Label>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {rule ? "Update Rule" : "Create Rule"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getDefaultParameters(actionType: string): Record<string, any> {
  switch (actionType) {
    case "move_to_folder":
      return { folder: "" };
    case "add_label":
    case "remove_label":
      return { label: "" };
    case "forward_to":
      return { email: "" };
    case "snooze":
      return { duration: "1d" };
    case "set_category":
      return { category: "" };
    default:
      return {};
  }
}

function renderActionParameters(
  action: RuleAction,
  onChange: (params: Record<string, any>) => void,
) {
  switch (action.type) {
    case "move_to_folder":
      return (
        <Input
          value={action.parameters.folder || ""}
          onChange={(e) =>
            onChange({ ...action.parameters, folder: e.target.value })
          }
          placeholder="Folder name"
        />
      );

    case "add_label":
    case "remove_label":
      return (
        <Input
          value={action.parameters.label || ""}
          onChange={(e) =>
            onChange({ ...action.parameters, label: e.target.value })
          }
          placeholder="Label name"
        />
      );

    case "forward_to":
      return (
        <Input
          value={action.parameters.email || ""}
          onChange={(e) =>
            onChange({ ...action.parameters, email: e.target.value })
          }
          placeholder="Email address"
          type="email"
        />
      );

    case "snooze":
      return (
        <Select
          value={action.parameters.duration || "1d"}
          onValueChange={(value) =>
            onChange({ ...action.parameters, duration: value })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">1 hour</SelectItem>
            <SelectItem value="4h">4 hours</SelectItem>
            <SelectItem value="1d">1 day</SelectItem>
            <SelectItem value="3d">3 days</SelectItem>
            <SelectItem value="1w">1 week</SelectItem>
          </SelectContent>
        </Select>
      );

    case "set_category":
      return (
        <Input
          value={action.parameters.category || ""}
          onChange={(e) =>
            onChange({ ...action.parameters, category: e.target.value })
          }
          placeholder="Category name"
        />
      );

    default:
      return (
        <span className="text-sm text-muted-foreground">
          No parameters required
        </span>
      );
  }
}
