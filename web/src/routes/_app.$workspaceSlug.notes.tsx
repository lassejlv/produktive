import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { NotesPage } from "@/components/notes/notes-page";
import { notesQueryOptions } from "@/lib/queries/notes";

export const Route = createFileRoute("/_app/$workspaceSlug/notes")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(notesQueryOptions()),
  component: NotesIndex,
});

function NotesIndex() {
  const { workspaceSlug } = Route.useParams();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const prefix = `/${workspaceSlug}/notes/`;
  const noteId = pathname.startsWith(prefix)
    ? decodeURIComponent(pathname.slice(prefix.length))
    : undefined;

  return <NotesPage noteId={noteId} />;
}
