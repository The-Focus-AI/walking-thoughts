"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ResearchStep, ThreadEnrichment } from "@/lib/enrichment/types";

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

/**
 * A report-style Enrichment: markdown body, numbered source chips, and the
 * research trace folded away (thread-review prototype, Enrich variant A).
 */
export function EnrichmentReport({
  enrichment,
  heading = "Walking Thoughts",
}: {
  enrichment: ThreadEnrichment;
  heading?: string;
}) {
  return (
    <article
      className="enrichment-report"
      data-testid="enrichment-report"
      aria-label={`${heading} report · ${enrichment.model}`}
    >
      <header className="enrichment-report-head">
        <span className="enrichment-report-mark" aria-hidden="true">
          ✦
        </span>
        <span className="thread-speaker">{heading}</span>
        <span className="enrichment-model">{enrichment.model}</span>
        <time dateTime={enrichment.createdAt}>
          {new Date(enrichment.createdAt).toLocaleString()}
        </time>
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
    </article>
  );
}
