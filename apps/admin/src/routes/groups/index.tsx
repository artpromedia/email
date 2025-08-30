import React, { Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { TableSkeleton } from "../../components/Skeleton";

// Lazy load components
const GroupsPage = React.lazy(() =>
  import("./GroupsPage").then((module) => ({ default: module.GroupsPage })),
);

export default function GroupsRoutes() {
  return (
    <Routes>
      <Route
        index
        element={
          <Suspense fallback={<TableSkeleton />}>
            <GroupsPage />
          </Suspense>
        }
      />
    </Routes>
  );
}
