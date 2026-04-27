import { createFileRoute } from "@tanstack/react-router";
import { NewIssueDialog } from "@/components/issue/new-issue-dialog";
import { useSession } from "@/lib/auth-client";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardLanding,
});

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(name: string | undefined) {
  if (!name) return null;
  return name.split(/\s+/)[0];
}

function DashboardLanding() {
  const session = useSession();
  const name = firstName(session.data?.user?.name);

  return (
    <main className="grid min-h-[calc(100vh-0px)] place-items-center px-6">
      <div className="flex flex-col items-center text-center animate-fade-in">
        <h1 className="text-2xl font-medium text-fg sm:text-3xl">
          {greeting()}
          {name ? `, ${name}` : ""}
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          What do you want to work on?
        </p>
        <div className="mt-6">
          <NewIssueDialog triggerVariant="outline" triggerSize="sm" />
        </div>
      </div>
    </main>
  );
}
