import { createFileRoute } from "@tanstack/react-router";
import { NotesPage } from "@/components/notes/notes-page";
import {
  noteDetailQueryOptions,
  notesQueryOptions,
} from "@/lib/queries/notes";

export const Route = createFileRoute("/_app/$workspaceSlug/notes/$noteId")({
  loader: ({ context, params }) => {
    void context.queryClient.ensureQueryData(notesQueryOptions());
    return context.queryClient.ensureQueryData(noteDetailQueryOptions(params.noteId));
  },
  component: NoteDetailRoute,
});

function NoteDetailRoute() {
  const { noteId } = Route.useParams();
  return <NotesPage noteId={noteId} />;
}
