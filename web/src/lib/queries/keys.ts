export const queryKeys = {
  issues: {
    all: ["issues"] as const,
    list: () => ["issues", "list"] as const,
    detail: (id: string) => ["issues", "detail", id] as const,
    history: (id: string) => ["issues", "detail", id, "history"] as const,
    comments: (id: string) => ["issues", "detail", id, "comments"] as const,
    subscribers: (id: string) => ["issues", "detail", id, "subscribers"] as const,
  },
  projects: {
    all: ["projects"] as const,
    list: (includeArchived: boolean) =>
      ["projects", "list", { includeArchived }] as const,
    detail: (id: string) => ["projects", "detail", id] as const,
  },
  labels: {
    all: ["labels"] as const,
    list: (includeArchived: boolean) =>
      ["labels", "list", { includeArchived }] as const,
  },
  favorites: ["favorites"] as const,
  inbox: ["inbox"] as const,
  chats: ["chats"] as const,
  mcp: {
    keys: ["mcp", "keys"] as const,
    servers: ["mcp", "servers"] as const,
  },
  billing: {
    status: ["billing", "status"] as const,
    plans: ["billing", "plans"] as const,
  },
  ai: {
    models: ["ai", "models"] as const,
  },
  github: {
    connection: ["github", "connection"] as const,
    repositories: ["github", "repositories"] as const,
    repositorySearch: (q: string) =>
      ["github", "repository-search", q] as const,
  },
  members: ["members"] as const,
  invitations: ["invitations"] as const,
} as const;
