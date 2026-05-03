import { queryOptions, useQuery } from "@tanstack/react-query";
import { type SlackConnection, getSlackConnection } from "../api";
import { queryKeys } from "./keys";

export const slackConnectionQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.slack.connection,
    queryFn: getSlackConnection,
    staleTime: 5 * 60_000,
  });

export const useSlackConnectionQuery = () => useQuery(slackConnectionQueryOptions());

export type { SlackConnection };
