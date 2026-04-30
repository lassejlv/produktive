export type StepId =
  | "welcome"
  | "sidebar"
  | "new-issue"
  | "issue-list"
  | "issue-detail"
  | "fields"
  | "project-switcher"
  | "github-sync"
  | "tabs-feature"
  | "done";

export type SignalName = "issue-created" | "priority-or-assignee-changed";

export type AwaitMode = "next" | { event: SignalName };

export type OnboardingStep = {
  id: StepId;
  target: string | null;
  title: string;
  body: string;
  link?: { url: string; label: string };
  placement?: "top" | "bottom" | "left" | "right";
  await: AwaitMode;
  ctaLabel?: string;
  navigateBefore?: "/issues" | "/issues/$first";
  requiresFirstIssue?: boolean;
  successToast?: string;
};

export const STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    target: null,
    title: "Welcome to Produktive",
    body: "A focused issue tracker built for shipping. Take a quick tour of the basics — it'll be over before your coffee cools.",
    await: "next",
    ctaLabel: "Let's go",
  },
  {
    id: "sidebar",
    target: '[data-tour="sidebar"]',
    placement: "right",
    title: "Your sidebar",
    body: "This is your sidebar — your projects and navigation live here.",
    await: "next",
  },
  {
    id: "new-issue",
    target: '[data-tour="new-issue-trigger"]',
    placement: "bottom",
    title: "Create your first issue",
    body: "Create issues here — this is where your work starts. Go ahead, click it.",
    await: { event: "issue-created" },
    successToast: "🎉 Nice — you just created your first issue!",
    navigateBefore: "/issues",
  },
  {
    id: "issue-list",
    target: '[data-tour="issue-list"]',
    placement: "top",
    title: "Your issues",
    body: "All your issues live here. You can filter, sort, and click any issue to see details.",
    await: "next",
    navigateBefore: "/issues",
  },
  {
    id: "issue-detail",
    target: '[data-tour="issue-detail"]',
    placement: "left",
    title: "Edit & ship",
    body: "This is where you edit issues — update the title, description, priority, and assign teammates.",
    await: "next",
    navigateBefore: "/issues/$first",
    requiresFirstIssue: true,
  },
  {
    id: "fields",
    target: '[data-tour="issue-fields"]',
    placement: "left",
    title: "Priority & assignee",
    body: "Set priority and assign people to keep your work organized. Try changing one — or hit Next.",
    await: { event: "priority-or-assignee-changed" },
    successToast: "Looking good — fields updated.",
    requiresFirstIssue: true,
  },
  {
    id: "project-switcher",
    target: '[data-tour="org-switcher"]',
    placement: "bottom",
    title: "Workspaces & settings",
    body: "Switch between projects here, or tweak your workspace settings anytime.",
    await: "next",
  },
  {
    id: "github-sync",
    target: null,
    title: "Sync from GitHub",
    body: "Already tracking issues elsewhere? Connect a repo from Workspace settings → GitHub to import existing issues and keep them in sync automatically.",
    await: "next",
  },
  {
    id: "tabs-feature",
    target: null,
    title: "Optional: tab bar",
    body: "Want browser-style tabs? A draggable bar at the bottom keeps the issues, projects, and pages you've opened one click away. It's off by default — flip it on under Account → Appearance whenever you want.",
    link: {
      url: "/account",
      label: "Open account settings",
    },
    await: "next",
  },
  {
    id: "done",
    target: null,
    title: "You're all set 🎉",
    body: "You now know the basics of Produktive. It's also fully open source — contributions, issues, and stars are all welcome.",
    link: {
      url: "https://github.com/lassejlv/produktive",
      label: "View on GitHub",
    },
    await: "next",
    ctaLabel: "Start working",
  },
];

export const stepIndex = (id: StepId): number =>
  STEPS.findIndex((step) => step.id === id);
