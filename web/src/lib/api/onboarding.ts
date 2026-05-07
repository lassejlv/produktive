import { internalGraphQLMutation } from "./client";

export type OnboardingPatch = {
  completed?: boolean;
  step?: string;
};

export type OnboardingUserResponse = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  onboardingCompletedAt: string | null;
  onboardingStep: string | null;
};

export const markOnboarding = (patch: OnboardingPatch) =>
  internalGraphQLMutation<OnboardingUserResponse>(
    "PATCH",
    "/api/me/onboarding",
    patch,
  );
