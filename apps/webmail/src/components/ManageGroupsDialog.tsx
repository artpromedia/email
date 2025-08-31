import { useState } from "react";
import { Users, Plus, Edit2, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface ContactGroup {
  id: string;
  name: string;
  description?: string;
  color: string;
  contactCount: number;
}

interface ManageGroupsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: ContactGroup[];
  onGroupsUpdated: (groups: ContactGroup[]) => void;
}

const DEFAULT_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#64748b", // slate
  "#78716c", // stone
];

export function ManageGroupsDialog({
  open,
  onOpenChange,
  groups,
  onGroupsUpdated,
}: ManageGroupsDialogProps) {
  const [localGroups, setLocalGroups] = useState<ContactGroup[]>([...groups]);
  const [editingGroup, setEditingGroup] = useState<ContactGroup | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: DEFAULT_COLORS[0],
  });

  const handleCreateGroup = () => {
    setIsCreating(true);
    setEditingGroup(null);
    setFormData({
      name: "",
      description: "",
      color: DEFAULT_COLORS[0],
    });
  };

  const handleEditGroup = (group: ContactGroup) => {
    setEditingGroup(group);
    setIsCreating(false);
    setFormData({
      name: group.name,
      description: group.description || "",
      color: group.color,
    });
  };

  const handleSaveGroup = () => {
    if (!formData.name.trim()) return;

    if (isCreating) {
      // Create new group
      const newGroup: ContactGroup = {
        id: Date.now().toString(),
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        color: formData.color,
        contactCount: 0,
      };
      setLocalGroups((prev) => [...prev, newGroup]);
    } else if (editingGroup) {
      // Update existing group
      setLocalGroups((prev) =>
        prev.map((group) =>
          group.id === editingGroup.id
            ? {
                ...group,
                name: formData.name.trim(),
                description: formData.description.trim() || undefined,
                color: formData.color,
              }
            : group,
        ),
      );
    }

    // Reset form
    setIsCreating(false);
    setEditingGroup(null);
    setFormData({
      name: "",
      description: "",
      color: DEFAULT_COLORS[0],
    });
  };

  const handleDeleteGroup = (groupId: string) => {
    const group = localGroups.find((g) => g.id === groupId);
    if (!group) return;

    if (group.contactCount > 0) {
      const confirmed = confirm(
        `Are you sure you want to delete "${group.name}"? This group contains ${group.contactCount} contact${group.contactCount !== 1 ? "s" : ""}. The contacts will not be deleted, but they will be removed from this group.`,
      );
      if (!confirmed) return;
    }

    setLocalGroups((prev) => prev.filter((g) => g.id !== groupId));
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingGroup(null);
    setFormData({
      name: "",
      description: "",
      color: DEFAULT_COLORS[0],
    });
  };

  const handleSave = () => {
    onGroupsUpdated(localGroups);
    onOpenChange(false);
  };

  const handleClose = () => {
    // Reset to original groups if user cancels
    setLocalGroups([...groups]);
    setIsCreating(false);
    setEditingGroup(null);
    setFormData({
      name: "",
      description: "",
      color: DEFAULT_COLORS[0],
    });
    onOpenChange(false);
  };

  const isFormOpen = isCreating || editingGroup !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Manage Contact Groups
          </DialogTitle>
          <DialogDescription>
            Create, edit, and organize your contact groups
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Groups List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Contact Groups</h4>
              <Button onClick={handleCreateGroup} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Group
              </Button>
            </div>

            {localGroups.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No contact groups yet</p>
                <p className="text-sm">
                  Create your first group to organize your contacts
                </p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Contacts</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {localGroups.map((group) => (
                      <TableRow key={group.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: group.color }}
                            />
                            <span className="font-medium">{group.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-gray-600">
                            {group.description || "No description"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {group.contactCount} contact
                            {group.contactCount !== 1 ? "s" : ""}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditGroup(group)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteGroup(group.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Create/Edit Form */}
          {isFormOpen && (
            <>
              <Separator />
              <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                <h4 className="font-medium">
                  {isCreating ? "Create New Group" : "Edit Group"}
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="group-name">Group Name *</Label>
                    <Input
                      id="group-name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      placeholder="e.g., Work Colleagues"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Color</Label>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full border-2 border-gray-200"
                        style={{ backgroundColor: formData.color }}
                      />
                      <div className="grid grid-cols-5 gap-1">
                        {DEFAULT_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={`w-6 h-6 rounded-full border-2 ${
                              formData.color === color
                                ? "border-gray-800"
                                : "border-gray-200"
                            }`}
                            style={{ backgroundColor: color }}
                            onClick={() =>
                              setFormData((prev) => ({ ...prev, color }))
                            }
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="group-description">Description</Label>
                  <Textarea
                    id="group-description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Optional description for this group"
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveGroup}
                    disabled={!formData.name.trim()}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {isCreating ? "Create Group" : "Save Changes"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Groups</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
