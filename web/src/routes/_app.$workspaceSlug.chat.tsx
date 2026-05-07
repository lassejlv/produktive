import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { ChatPane } from "@/components/chat/chat-pane";

export const Route = createFileRoute("/_app/$workspaceSlug/chat")({
  component: ChatIndex,
});

function ChatIndex() {
  const { workspaceSlug } = Route.useParams();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const prefix = `/${workspaceSlug}/chat/`;
  const chatId = pathname.startsWith(prefix)
    ? decodeURIComponent(pathname.slice(prefix.length))
    : null;

  return <ChatPane chatId={chatId} />;
}
