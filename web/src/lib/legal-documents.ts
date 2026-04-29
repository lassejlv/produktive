import privacyMarkdown from "../../../PRIVACY.md?raw";
import termsMarkdown from "../../../TERMS.md?raw";

export type LegalDocumentType = "terms" | "privacy";

export type LegalDocument = {
  type: LegalDocumentType;
  title: string;
  shortTitle: string;
  description: string;
  effectiveDate: string;
  markdown: string;
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentType, LegalDocument> = {
  terms: {
    type: "terms",
    title: "Terms of Service",
    shortTitle: "Terms",
    description:
      "The rules for using Produktive, including accounts, workspaces, AI features, billing, refunds, and acceptable use.",
    effectiveDate: "April 29, 2026",
    markdown: termsMarkdown,
  },
  privacy: {
    type: "privacy",
    title: "Privacy Policy",
    shortTitle: "Privacy",
    description:
      "How Produktive collects, uses, stores, and shares personal data across the app, API, billing, email, AI, and integrations.",
    effectiveDate: "April 29, 2026",
    markdown: privacyMarkdown,
  },
};

export const legalDocuments = [LEGAL_DOCUMENTS.terms, LEGAL_DOCUMENTS.privacy];

export function getLegalDocument(type: string): LegalDocument | null {
  return LEGAL_DOCUMENTS[type as LegalDocumentType] ?? null;
}
