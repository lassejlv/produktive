import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  type GithubConnection,
  type GithubRepository,
  getGithubConnection,
  listGithubRepositories,
} from "../api";
import { queryKeys } from "./keys";

export const githubConnectionQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.github.connection,
    queryFn: getGithubConnection,
    staleTime: 5 * 60_000,
  });

export const githubRepositoriesQueryOptions = (enabled = true) =>
  queryOptions({
    queryKey: queryKeys.github.repositories,
    queryFn: () => listGithubRepositories().then((r) => r.repositories),
    staleTime: 60_000,
    enabled,
  });

export const useGithubConnectionQuery = () =>
  useQuery(githubConnectionQueryOptions());

export const useGithubRepositoriesQuery = (enabled = true) =>
  useQuery(githubRepositoriesQueryOptions(enabled));

export type { GithubConnection, GithubRepository };
