import { createFileRoute, Outlet } from "@tanstack/react-router";

// Un-nested from the `/s` domain layout so the slug pages render on their own;
// acts as the layout for the status page and its `/incidents` child.
export const Route = createFileRoute("/s_/$slug")({
  component: () => <Outlet />,
});
