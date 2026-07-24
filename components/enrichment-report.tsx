"use client";

import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  EnrichmentMemoryPatch,
  ResearchStep,
  ThreadEnrichment,
} from "@/lib/enrichment/types";

/** Enrichment body as sanitized markdown (react-markdown escapes raw HTML). */
export function EnrichmentMarkdown({ text }: { text: string }) {
  return (
    <div className="enrichment-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => (
            <a {...props} target="_blank" rel="noreferrer">
              {props.children}
            </a>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}

function researchSummary(steps: ResearchStep[]): string {
  const searches = steps.filter((step) => step.action === "search").length;
  const reads = steps.filter((step) => step.action === "read").length;
  const parts: string[] = [];
  if (searches > 0) parts.push(`${searches} search${searches === 1 ? "" : "es"}`);
  if (reads > 0) parts.push(`${reads} page${reads === 1 ? "" : "s"} read`);
  return parts.join(" · ") || "no tool calls";
}

function ResearchTrace({ steps }: { steps: ResearchStep[] }) {
  if (steps.length === 0) return null;
  return (
    <details className="enrichment-trace">
      <summary>Research · {researchSummary(steps)}</summary>
      <ol>
        {steps.map((step, index) => (
          <li key={index}>
            <span className={`trace-tool trace-tool-${step.provider}`}>
              {step.provider}
            </span>
            {step.action === "search" ? (
              <span>
                Searched “{step.query}” · {step.resultCount} result
                {step.resultCount === 1 ? "" : "s"}
              </span>
            ) : (
              <span>
                Read{" "}
                <a href={step.url} target="_blank" rel="noreferrer">
                  {step.title}
                </a>
              </span>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

function memoryPatchSummary(patches: EnrichmentMemoryPatch[]): string {
  const counts: Record<EnrichmentMemoryPatch["op"], number> = {
    add: 0,
    update: 0,
    remove: 0,
  };
  for (const patch of patches) counts[patch.op] += 1;
  const parts: string[] = [];
  if (counts.add > 0) parts.push(`+${counts.add}`);
  if (counts.update > 0) parts.push(`~${counts.update}`);
  if (counts.remove > 0) parts.push(`−${counts.remove}`);
  return parts.join(" ");
}

/**
 * Visible processing: when this Annotation revised the walker profile, it
 * says so in the machine's mono voice, in the moment — not only in the
 * Interview ledger.
 */
function MemoryPatchFooter({ patches }: { patches: EnrichmentMemoryPatch[] }) {
  if (patches.length === 0) return null;
  return (
    <p className="enrichment-memory-note" data-testid="enrichment-memory-note">
      <span>Profile revised · {memoryPatchSummary(patches)}</span>
      <Link href="/interview">Review</Link>
    </p>
  );
}

/**
 * An Enrichment rendered as the machine's Annotation (DESIGN.md): sky left
 * rule, mono sky header with the model ID, upright markdown body, numbered
 * source citations, and the research trace folded away.
 */
export function EnrichmentReport({
  enrichment,
}: {
  enrichment: ThreadEnrichment;
}) {
  return (
    <article
      className="enrichment-report"
      data-testid="enrichment-report"
      aria-label={`Annotation · ${enrichment.model}`}
    >
      <header className="enrichment-report-head">
        <span>Annotation</span>
        <time dateTime={enrichment.createdAt}>
          {new Date(enrichment.createdAt).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </time>
        <span className="enrichment-model">{enrichment.model}</span>
      </header>
      <EnrichmentMarkdown text={enrichment.text} />
      {enrichment.sources.length > 0 ? (
        <ul className="enrichment-source-chips" aria-label="Sources">
          {enrichment.sources.map((source, index) => (
            <li key={`${source.url}-${index}`}>
              <a href={source.url} target="_blank" rel="noreferrer">
                <span className="enrichment-source-index">{index + 1}</span>
                {source.title}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <ResearchTrace steps={enrichment.research ?? []} />
      <MemoryPatchFooter patches={enrichment.memoryPatches ?? []} />
    </article>
  );
}
