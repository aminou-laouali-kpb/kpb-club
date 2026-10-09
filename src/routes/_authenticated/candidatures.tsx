import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/candidatures")({
  component: () => <Outlet />,
});
