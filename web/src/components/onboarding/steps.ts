export type StepId =
  | "welcome"
  | "sidebar"
  | "new-issue"
  | "issue-list"
  | "issue-detail"
  | "fields"
  | "project-switcher"
  | "done";

export type SignalName = "issue-created" | "priority-or-assignee-changed";

export type AwaitMode = "next" | { event: SignalName };

export type OnboardingStep = {
  id: StepId;
  target: string | null;
  title: string;
  body: string;
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
    id: "done",
    target: null,
    title: "You're all set 🎉",
    body: "You now know the basics of Produktive. Have fun shipping.",
    await: "next",
    ctaLabel: "Start working",
  },
];

export const stepIndex = (id: StepId): number =>
  STEPS.findIndex((step) => step.id === id);
