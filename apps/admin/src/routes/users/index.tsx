import React, { Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import {
  UserListSkeleton,
  UserDetailSkeleton,
} from "../../components/UserSkeletons";

// Lazy load existing components
const SimpleEnterpriseUsersList = React.lazy(
  () => import("./SimpleEnterpriseUsersList"),
);

// Lazy load new import/export components
const UserCreatePage = React.lazy(() =>
  import("./UserCreatePage").then((module) => ({
    default: module.UserCreatePage,
  })),
);

const UserImportPage = React.lazy(() =>
  import("./UserImportPage").then((module) => ({
    default: module.UserImportPage,
  })),
);

const UserExportPage = React.lazy(() =>
  import("./UserExportPage").then((module) => ({
    default: module.UserExportPage,
  })),
);

// Placeholder component for user detail route not yet implemented
const UserDetail = () => (
  <div className="p-6">
    <h2 className="text-xl font-semibold mb-4">User Details</h2>
    <p className="text-gray-600">
      Coming Soon - User details view will be implemented here.
    </p>
  </div>
);

export default function UsersRoutes() {
  return (
    <Routes>
      <Route
        index
        element={
          <Suspense fallback={<UserListSkeleton />}>
            <SimpleEnterpriseUsersList />
          </Suspense>
        }
      />
      <Route
        path="new"
        element={
          <Suspense fallback={<UserDetailSkeleton />}>
            <UserCreatePage />
          </Suspense>
        }
      />
      <Route
        path="import"
        element={
          <Suspense fallback={<UserDetailSkeleton />}>
            <UserImportPage />
          </Suspense>
        }
      />
      <Route
        path="export"
        element={
          <Suspense fallback={<UserDetailSkeleton />}>
            <UserExportPage />
          </Suspense>
        }
      />
      <Route
        path=":userId"
        element={
          <Suspense fallback={<UserDetailSkeleton />}>
            <UserDetail />
          </Suspense>
        }
      />
    </Routes>
  );
}
