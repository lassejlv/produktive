import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  type Issue,
  type IssueComment,
  type IssueHistoryEvent,
  type IssueSubscribersResponse,
  getIssue,
  getIssueHistory,
  listIssueComments,
  listIssueSubscribers,
  listIssues,
} from "../api";
import { queryKeys } from "./keys";

export const issuesQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.issues.list(),
    queryFn: () => listIssues().then((r) => r.issues),
    staleTime: 60_000,
  });

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

export const useIssuesQuery = () => useQuery(issuesQueryOptions());
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
};
