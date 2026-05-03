import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type SlackConnection,
  disconnectSlack,
  startSlackOAuth,
  updateSlackConnection,
} from "@/lib/api";
import { queryKeys } from "@/lib/queries/keys";

export function useStartSlackOAuth() {
  return useMutation({ mutationFn: startSlackOAuth });
}

export function useUpdateSlackConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateSlackConnection,
    onSuccess: (connection) => {
      qc.setQueryData<SlackConnection>(queryKeys.slack.connection, connection);
    },
  });
}

export function useDisconnectSlack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: disconnectSlack,
    onSuccess: () => {
      qc.setQueryData<SlackConnection>(queryKeys.slack.connection, {
        connected: false,
        teamId: null,
        teamName: null,
        botUserId: null,
        scope: null,
        agentEnabled: false,
        connectedAt: null,
      });
    },
  });
}
