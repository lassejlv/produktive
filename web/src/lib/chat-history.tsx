export const greetingForNow = () => {
  const hour = new Date().getHours();
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

export const firstName = (full?: string | null) => {
  if (!full) return null;
  return full.trim().split(/\s+/)[0] || null;
};
