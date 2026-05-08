export type ActorProfile = {
  kind: "user" | "agent";
  id: string;
  name: string;
  image: string | null;
  clientId?: string | null;
};
