import { queryOptions, useQuery } from "@tanstack/react-query";
import { type Project, getProject, listProjects } from "../api";
import { queryKeys } from "./keys";

export const projectsQueryOptions = (includeArchived = false) =>
  queryOptions({
    queryKey: queryKeys.projects.list(includeArchived),
    queryFn: () => listProjects(includeArchived).then((r) => r.projects),
    staleTime: 60_000,
  });

export const projectDetailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.projects.detail(id),
    queryFn: () => getProject(id).then((r) => r.project),
    staleTime: 60_000,
  });

export const useProjectsQuery = (includeArchived = false) =>
  useQuery(projectsQueryOptions(includeArchived));

export const useProjectDetailQuery = (id: string) =>
  useQuery(projectDetailQueryOptions(id));

export type { Project };
