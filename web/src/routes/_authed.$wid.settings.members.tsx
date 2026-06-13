import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { EmptyState } from "../components/EmptyState";

export const Route = createFileRoute("/_authed/$wid/settings/members")({
  staticData: {
    title: "Settings",
    description: "Invite teammates, assign roles, and manage workspace access.",
  },
  component: () => (
    <EmptyState icon={Users} title="Coming soon" description="Member management is on the way." />
  ),
});
