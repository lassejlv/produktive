import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { ChatPane } from "@/components/chat/chat-pane";

export const Route = createFileRoute("/_app/chat")({
  component: ChatIndex,
});

function ChatIndex() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const chatId = pathname.startsWith("/chat/")
    ? decodeURIComponent(pathname.slice("/chat/".length))
    : null;

  return <ChatPane chatId={chatId} />;
}
