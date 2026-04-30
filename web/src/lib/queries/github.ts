import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import {
  type GithubConnection,
  type GithubRepository,
  getGithubConnection,
  listGithubRepositories,
  searchGithubRepositories,
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

export const githubRepositorySearchQueryOptions = (
  query: string,
  enabled = true,
) =>
  queryOptions({
    queryKey: queryKeys.github.repositorySearch(query),
    queryFn: () => searchGithubRepositories({ q: query }).then((r) => r.repositories),
    staleTime: 30_000,
    enabled,
    placeholderData: keepPreviousData,
  });

export const useGithubConnectionQuery = () =>
  useQuery(githubConnectionQueryOptions());

export const useGithubRepositoriesQuery = (enabled = true) =>
  useQuery(githubRepositoriesQueryOptions(enabled));

export const useGithubRepositorySearchQuery = (query: string, enabled = true) =>
  useQuery(githubRepositorySearchQueryOptions(query, enabled));

export type { GithubConnection, GithubRepository };
