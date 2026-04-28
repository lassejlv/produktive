import {
  projectColorHex,
  projectColorOptions,
} from "@/lib/project-constants";

// Reuse the same 8-color palette as projects so all chip colors stay
// consistent across the app.
export const labelColorOptions = projectColorOptions;
export type LabelColor = (typeof labelColorOptions)[number];
export const labelColorHex = projectColorHex;

export const defaultLabelColor: LabelColor = "gray";
