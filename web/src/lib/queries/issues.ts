import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import {
  type Issue,
  type IssueComment,
  type IssueHistoryEvent,
  type IssueSubscribersResponse,
  type IssuesPage,
  getIssue,
  getIssueHistory,
  listIssueComments,
  listIssueSubscribers,
  listIssues,
} from "../api";
import { queryKeys } from "./keys";

export const ISSUES_PAGE_SIZE = 50;

export const issuesInfiniteQueryOptions = () =>
  infiniteQueryOptions({
    queryKey: queryKeys.issues.list(),
    queryFn: ({ pageParam }) => listIssues(ISSUES_PAGE_SIZE, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    staleTime: 60_000,
  });

export const useIssuesInfiniteQuery = () =>
  useInfiniteQuery(issuesInfiniteQueryOptions());

export const issueDetailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.issues.detail(id),
    queryFn: () => getIssue(id).then((r) => r.issue),
    staleTime: 60_000,
  });

export const issueHistoryQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.issues.history(id),
    queryFn: () => getIssueHistory(id).then((r) => r.events),
    staleTime: 60_000,
  });

export const issueCommentsQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.issues.comments(id),
    queryFn: () => listIssueComments(id).then((r) => r.comments),
    staleTime: 60_000,
  });

export const issueSubscribersQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.issues.subscribers(id),
    queryFn: () => listIssueSubscribers(id),
    staleTime: 60_000,
  });

export const useIssueDetailQuery = (id: string) =>
  useQuery(issueDetailQueryOptions(id));
export const useIssueHistoryQuery = (id: string) =>
  useQuery(issueHistoryQueryOptions(id));
export const useIssueCommentsQuery = (id: string) =>
  useQuery(issueCommentsQueryOptions(id));
export const useIssueSubscribersQuery = (id: string) =>
  useQuery(issueSubscribersQueryOptions(id));

export type {
  Issue,
  IssueComment,
  IssueHistoryEvent,
  IssueSubscribersResponse,
  IssuesPage,
};
