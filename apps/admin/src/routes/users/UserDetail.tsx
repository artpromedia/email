import React, { Suspense } from "react";
import { useParams } from "react-router-dom";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ArrowLeft, User, Shield, Mail, Users, Activity } from "lucide-react";
import { Link } from "react-router-dom";
import { UserDetailSkeleton } from "../../components/UserSkeletons";
import { useUser } from "../../data/users-detail";

// Import tab components
import { ProfileTab } from "./tabs/ProfileTab";
import { SecurityTab } from "./tabs/SecurityTab";
import { MailboxTab } from "./tabs/MailboxTab";
import { GroupsTab } from "./tabs/GroupsTab";
import { ActivityTab } from "./tabs/ActivityTab";

const UserDetailHeader = ({ user }: { user: any }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-700";
      case "suspended":
        return "bg-red-100 text-red-700";
      case "pending":
        return "bg-yellow-100 text-yellow-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/users">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Users
            </Button>
          </Link>

          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-lg font-medium text-blue-600">
                {user.firstName?.charAt(0)}
                {user.lastName?.charAt(0)}
              </span>
            </div>

            <div>
              <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
              <p className="text-gray-500">{user.email}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Badge className={getStatusColor(user.status)}>{user.status}</Badge>
          <Badge variant={user.role === "admin" ? "default" : "secondary"}>
            {user.role}
          </Badge>
          {!user.enabled && <Badge variant="destructive">Disabled</Badge>}
        </div>
      </div>
    </div>
  );
};

const UserDetailContent = () => {
  const { userId } = useParams<{ userId: string }>();
  const { data: user, isLoading, error } = useUser(userId!);

  if (isLoading) {
    return <UserDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-red-600">
              Error loading user: {(error as Error).message}
            </p>
            <Link to="/users" className="mt-4 inline-block">
              <Button variant="outline">Back to Users</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-gray-500">User not found</p>
            <Link to="/users" className="mt-4 inline-block">
              <Button variant="outline">Back to Users</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <UserDetailHeader user={user} />

      <div className="max-w-7xl mx-auto px-6 py-6">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger
              value="profile"
              className="flex items-center space-x-2"
            >
              <User className="h-4 w-4" />
              <span>Profile</span>
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="flex items-center space-x-2"
            >
              <Shield className="h-4 w-4" />
              <span>Security</span>
            </TabsTrigger>
            <TabsTrigger
              value="mailbox"
              className="flex items-center space-x-2"
            >
              <Mail className="h-4 w-4" />
              <span>Mailbox</span>
            </TabsTrigger>
            <TabsTrigger value="groups" className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>Groups</span>
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="flex items-center space-x-2"
            >
              <Activity className="h-4 w-4" />
              <span>Activity</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <ProfileTab user={user} />
          </TabsContent>

          <TabsContent value="security">
            <SecurityTab user={user} />
          </TabsContent>

          <TabsContent value="mailbox">
            <MailboxTab user={user} />
          </TabsContent>

          <TabsContent value="groups">
            <GroupsTab user={user} />
          </TabsContent>

          <TabsContent value="activity">
            <ActivityTab user={user} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export const UserDetail = () => {
  return (
    <Suspense fallback={<UserDetailSkeleton />}>
      <UserDetailContent />
    </Suspense>
  );
};

export default UserDetail;
