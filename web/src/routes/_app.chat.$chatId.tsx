import { createFileRoute } from "@tanstack/react-router";
import { ChatPane } from "@/components/chat/chat-pane";

export const Route = createFileRoute("/_app/chat/$chatId")({
  component: ChatDetail,
});

function ChatDetail() {
  const { chatId } = Route.useParams();
  return <ChatPane chatId={chatId} />;
}
