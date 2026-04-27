import { createFileRoute } from "@tanstack/react-router";
import { ChatPane } from "@/components/chat/chat-pane";

export const Route = createFileRoute("/_app/chat")({
  component: ChatIndex,
});

function ChatIndex() {
  return <ChatPane chatId={null} />;
}
