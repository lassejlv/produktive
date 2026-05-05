import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { NotesPage } from "@/components/notes/notes-page";
import { noteFoldersQueryOptions, notesQueryOptions } from "@/lib/queries/notes";

export const Route = createFileRoute("/_app/notes")({
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(noteFoldersQueryOptions());
    return context.queryClient.ensureQueryData(notesQueryOptions());
  },
  component: NotesIndex,
});

function NotesIndex() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const noteId = pathname.startsWith("/notes/")
    ? decodeURIComponent(pathname.slice("/notes/".length))
    : undefined;

  return <NotesPage noteId={noteId} />;
}
