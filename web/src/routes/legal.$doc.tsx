import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "#/components/EmptyState";
import { Button } from "#/components/ui/button";
import { FullPageSpinner } from "#/components/FullPageSpinner";
import { MarketingShell } from "#/components/marketing/MarketingShell";
import { renderLegalMarkdown } from "#/lib/legal-markdown";

const LEGAL_DOCS = {
  terms: { title: "Terms of Service", path: "/TERMS.md" },
  privacy: { title: "Privacy Policy", path: "/PRIVACY.md" },
} as const;

type LegalDoc = keyof typeof LEGAL_DOCS;

export const Route = createFileRoute("/legal/$doc")({
  component: LegalPage,
});

function LegalPage() {
  const { doc: rawDoc } = Route.useParams();
  const doc = LEGAL_DOCS[rawDoc as LegalDoc];
  const markdown = useQuery({
    queryKey: ["legal-doc", rawDoc] as const,
    queryFn: async () => {
      if (!doc) throw new Error("Legal document not found");
      const response = await fetch(doc.path);
      if (!response.ok) {
        throw new Error(`Could not load ${doc.title.toLowerCase()}`);
      }
      return response.text();
    },
    enabled: !!doc,
  });

  if (!doc) {
    return (
      <MarketingShell>
        <div className="mx-auto max-w-[720px] px-6 py-16">
          <EmptyState title="Legal document not found" description="Choose terms or privacy." />
        </div>
      </MarketingShell>
    );
  }

  return (
    <MarketingShell>
      <main className="mx-auto max-w-[760px] px-6 pb-20 pt-10 sm:pt-14">
        <Button
          render={
            <Link to="/" className="mb-8">
              <ArrowLeft size={14} />
              Back
            </Link>
          }
          variant="ghost"
        />

        {markdown.isLoading && <FullPageSpinner />}

        {markdown.isError && (
          <EmptyState
            title={`Could not load ${doc.title}`}
            description={(markdown.error as Error).message}
          />
        )}

        {markdown.data && (
          <article
            className="legal-markdown"
            dangerouslySetInnerHTML={{ __html: renderLegalMarkdown(markdown.data) }}
          />
        )}
      </main>
    </MarketingShell>
  );
}
