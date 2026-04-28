export const projectStatusOptions = [
  "planned",
  "in-progress",
  "completed",
  "cancelled",
] as const;

export type ProjectStatus = (typeof projectStatusOptions)[number];

export const projectStatusLabel: Record<string, string> = {
  planned: "Planned",
  "in-progress": "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const projectStatusOrder = [
  "in-progress",
  "planned",
  "completed",
  "cancelled",
];

export const projectColorOptions = [
  "blue",
  "green",
  "orange",
  "purple",
  "pink",
  "red",
  "yellow",
  "gray",
] as const;

export type ProjectColor = (typeof projectColorOptions)[number];

export const projectColorHex: Record<string, string> = {
  blue: "#5b8cff",
  green: "#46b07a",
  orange: "#ff9456",
  purple: "#9061f9",
  pink: "#f472b6",
  red: "#e0594a",
  yellow: "#d4a23a",
  gray: "#7a7a82",
};

export const defaultProjectColor: ProjectColor = "blue";
export const defaultProjectStatus: ProjectStatus = "planned";

export const projectColorBackground = (color: string) => {
  const hex = projectColorHex[color] ?? projectColorHex.blue;
  // 22% opacity hex suffix for tinted background
  return `${hex}38`;
};
