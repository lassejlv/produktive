import { ArrowLeft } from "lucide-react";
import type { PublicIncident, StatusStyle } from "../../lib/types";
import { IncidentList } from "./Incidents";
import { StatusShell } from "./StatusShell";

interface Props {
  title: string;
  incidents: PublicIncident[];
  /** Link back to the status page. */
  statusHref: string;
  style: StatusStyle;
  generatedAt?: string;
}

/** Dedicated `<status>/incidents` page: the full incident history. */
export function IncidentsView({ title, incidents, statusHref, style, generatedAt }: Props) {
  return (
    <StatusShell
      title={title}
      style={style}
      generatedAt={generatedAt}
      documentTitle={`${title} — Incident history`}
    >
      <div className="pb-8 pt-10">
        <a
          href={statusHref}
          className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          <ArrowLeft size={13} />
          Back to status
        </a>
        <h1 className="text-[26px] font-medium leading-tight tracking-tight">Incident history</h1>
      </div>

      <IncidentList incidents={incidents} />
    </StatusShell>
  );
}
