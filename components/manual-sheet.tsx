import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import {
  KIND_LABELS,
  ROUTE_LABELS,
  THREAD_ROUTES,
  routeForKind,
  type ThreadKind,
  type ThreadRoute,
} from "@/lib/local-capture/types";

/**
 * The Field Manual: what happens to a thought between the trail and the
 * place it ends up. Read once, then never again — so it is a document, not
 * an instrument: one column, the walker's words in the serif italic, and
 * the Route legend built from the same vocabulary the desk uses so the two
 * can never drift.
 */

/** Which Kinds propose each Route, derived so the legend cannot go stale. */
const KINDS_BY_ROUTE = (Object.keys(KIND_LABELS) as ThreadKind[]).reduce(
  (map, kind) => {
    const route = routeForKind(kind);
    (map[route] ??= []).push(KIND_LABELS[kind]);
    return map;
  },
  {} as Partial<Record<ThreadRoute, string[]>>,
);

/** The key that sends a Thread to each Route in the Day flow. */
const ROUTE_KEY: Record<ThreadRoute, string> = {
  spec: "s",
  todo: "t",
  journal: "n",
  timeline: "p",
  drop: "x",
};

type RouteNote = {
  does: string;
  /** Live, or what it is still waiting on. */
  status: "live" | string;
};

const ROUTE_NOTES: Record<ThreadRoute, RouteNote> = {
  spec: {
    does: "Drafts a ticket-shaped issue in the Project's repository — the report becomes the issue body — for a coding agent to pick up. Never drafts twice for the same thought.",
    status: "Needs a token",
  },
  todo: {
    does: "Puts it on the task list in your own words, and into the day's checklist. No elaboration, no ceremony.",
    status: "Landing next",
  },
  journal: {
    does: "Files it into the notebook with the full report readable in place, and keeps the research reachable. Anything draft-worthy is flagged as a post candidate.",
    status: "live",
  },
  timeline: {
    does: "Adds the frame to its spot's strip — photos taken within about 25 metres across days become one place, automatically. This is how the same gate every morning becomes day 41.",
    status: "live",
  },
  drop: {
    does: "Buries it, so it never returns to the queue, and retracts its published page. Nothing is deleted: routing it to the notebook later restores the page at the same address.",
    status: "live",
  },
};

const STEPS = [
  {
    n: 1,
    title: "What came home",
    body: [
      "The day's thoughts, grouped by where the machine thinks each one belongs, with counts. Anything that needs a word is flagged here.",
      "Read it, then press Enter to start.",
    ],
  },
  {
    n: 2,
    title: "Route each one",
    body: [
      "One thought at a time: your words, the summary, the media with its coordinates, and the proposed destination already armed.",
      "Enter accepts the guess. One key sends it elsewhere. R opens the full report without leaving the card.",
    ],
  },
  {
    n: 3,
    title: "What happened",
    body: [
      "Receipts, not a confirmation screen: everything under where it went, with the handoff spelled out. Each line has an undo.",
      "Nothing left to press. The day is filed.",
    ],
  },
];

const KEYS: Array<[string, string]> = [
  ["⏎", "Start, then accept each guess"],
  ["s", "Send to Spec"],
  ["t", "Send to To-do"],
  ["n", "Send to the notebook"],
  ["p", "Send to the timeline"],
  ["x", "Drop it"],
  ["r", "Read the full report"],
  ["j", "Skip for now"],
];

export function ManualSheet() {
  return (
    <main className="manual-sheet" data-testid="manual">
      <header className="threads-queue-header">
        <div>
          <p className="eyebrow">Field Manual</p>
          <h1>How a thought gets home</h1>
          <p>
            You walk, and you say things into your phone. Each one becomes a
            Thread. On the way home the machine reads each Thread and writes
            back a title, what kind of thing it is, and — where it earns one —
            a researched report. Then you sit down, and the day asks one
            question per thought: <em>where does this go?</em> Answering that
            is the whole of the sit-down. It marks the thought handled and
            sends it somewhere real, in the same gesture.
          </p>
        </div>
      </header>

      <section className="manual-section" aria-labelledby="manual-trail">
        <p className="manual-stage">Stage 1</p>
        <h2 id="manual-trail">On the trail</h2>
        <p>
          Capture is one tap: type, photo, audio, or video. It commits to the
          phone first, so it works with no signal at all. Location rides along
          when the phone has one.
        </p>
        <p>
          Every Capture starts its own Thread. You are not filing anything yet,
          and you are not meant to. The only job on the trail is to not lose
          the thought.
        </p>
        <blockquote className="manual-words">
          For Welton — what if the scheduling piece became its own little
          worker, separate queue, so the main loop never blocks on it.
        </blockquote>
        <p className="manual-aside">
          Your words are always set like that, in the serif italic, so you can
          tell at a glance what you said from what the machine said about it.
        </p>
      </section>

      <section className="manual-section" aria-labelledby="manual-home">
        <p className="manual-stage">Stage 2</p>
        <h2 id="manual-home">On the way home</h2>
        <p>
          When the phone finds signal, each Thread syncs and gets enriched.
          Audio is transcribed first. The machine reads the whole Thread and
          writes back:
        </p>
        <ul className="manual-list">
          <li>
            <strong>A title</strong>
            {" — so the Thread stops being called “Thread”."}
          </li>
          <li>
            <strong>A Kind</strong> — {Object.values(KIND_LABELS).join(", ")}.
            What the thing <em>is</em>.
          </li>
          <li>
            <strong>A Project guess</strong>, but only from the list you have
            already made. It never invents a project name.
          </li>
          <li>
            <strong>A report</strong>, where one is earned: a question gets
            research with sources, an idea gets sharpened into something
            ticket-shaped, a task gets three sentences and a phone number.
          </li>
          <li>
            <strong>A question back</strong>, when it genuinely cannot tell. An
            unrecognized name produces <em>Needs a word</em> rather than a
            confident guess about the wrong thing.
          </li>
        </ul>
        <p>
          From the Kind it also proposes <strong>where the thought should go</strong>.
          That proposal is what you confirm at the desk.
        </p>
      </section>

      <section className="manual-section" aria-labelledby="manual-desk">
        <p className="manual-stage">Stage 3</p>
        <h2 id="manual-desk">At the desk</h2>
        <p>
          Open <Link href="/days">the day</Link>. If anything is unrouted, it
          opens on the flow — three steps, and the middle one is the only one
          you work in.
        </p>

        <ol className="manual-steps">
          {STEPS.map((step) => (
            <li key={step.n} className="manual-step">
              <span className="manual-step-n">Step {step.n}</span>
              <h3>{step.title}</h3>
              {step.body.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </li>
          ))}
        </ol>

        <div className="manual-rule">
          <span className="manual-rule-label">The rule underneath</span>
          <p>
            Routing a thought <em>does</em> it. There is no second button, no
            commit step, no are-you-sure — the moment you press a key, the
            thought is marked handled and its handoff happens. Undo is how you
            take it back, and it works for as long as you are still sitting
            there.
          </p>
        </div>
      </section>

      <section className="manual-section" aria-labelledby="manual-legend">
        <h2 id="manual-legend">The legend</h2>
        <p>
          Five destinations. The machine proposes one from the Kind; you
          confirm it or send it elsewhere.
        </p>
        <div className="manual-scroller">
          <table className="manual-table">
            <thead>
              <tr>
                <th scope="col">Route</th>
                <th scope="col">Key</th>
                <th scope="col">Proposed for</th>
                <th scope="col">What pressing it does</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {THREAD_ROUTES.map((route) => {
                const note = ROUTE_NOTES[route];
                return (
                  <tr key={route}>
                    <th scope="row" className={`manual-route dr-${route}`}>
                      {ROUTE_LABELS[route]}
                    </th>
                    <td>
                      <kbd className="manual-key">{ROUTE_KEY[route]}</kbd>
                    </td>
                    <td>{(KINDS_BY_ROUTE[route] ?? []).join(", ")}</td>
                    <td>{note.does}</td>
                    <td>
                      <span
                        className={
                          note.status === "live"
                            ? "manual-status live"
                            : "manual-status pending"
                        }
                      >
                        {note.status === "live" ? "Live" : note.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="manual-section" aria-labelledby="manual-keys">
        <h2 id="manual-keys">Every key</h2>
        <div className="manual-keys">
          {KEYS.map(([key, meaning]) => (
            <div key={key}>
              <kbd className="manual-key">{key}</kbd>
              <span>{meaning}</span>
            </div>
          ))}
        </div>
        <p className="manual-aside">
          Keys go quiet while you are typing in a field. A whole day of nine
          thoughts, accepting most guesses, is about thirty seconds.
        </p>
      </section>

      <section className="manual-section" aria-labelledby="manual-where">
        <h2 id="manual-where">Where things end up</h2>
        <ul className="manual-list">
          <li>
            <strong>
              <Link href="/journal/notebook">The notebook</Link>
            </strong>{" "}
            — entries with your words and the report, linking back to the
            Thread and its published page. There is a view for just the post
            candidates.
          </li>
          <li>
            <strong>
              <Link href="/journal">The map journal</Link>
            </strong>{" "}
            — spots show as day-counted rings; tap one for the strip, frames in
            day order with each one&rsquo;s distance from the centre of the
            spot.
          </li>
          <li>
            <strong>The repository</strong> — a drafted issue, titled from the
            thought, bodied from the report, ready for an agent.
          </li>
          <li>
            <strong>The task list</strong> — arriving with the next change.
          </li>
        </ul>
      </section>

      <section className="manual-section" aria-labelledby="manual-backlog">
        <h2 id="manual-backlog">The thoughts you didn&rsquo;t route</h2>
        <p>
          The day flow only ever asks about today. Everything older lives at
          the desk, where a rail of counted facets — state, kind, project,
          media, attention — and a set of lenses let you re-stack the pile
          until you find what you are after.
        </p>
        <div className="manual-rule">
          <span className="manual-rule-label">One pile, one gesture</span>
          <p>
            The rail and the lenses only <em>find</em> things. Settling a
            thought is the same single act everywhere: give it a destination.
            There is no second way to file something, and no way to mark a
            thought read without saying where it goes.
          </p>
        </div>
      </section>

      <section className="manual-section" aria-labelledby="manual-setup">
        <h2 id="manual-setup">Before it all works</h2>
        <ul className="manual-list">
          <li>
            <strong>Spec handoff needs a credential.</strong> Add{" "}
            <code>SPEC_HANDOFF_GITHUB_TOKEN</code> to fnox and Vercel. Until
            then, routing to Spec records the decision and says plainly on the
            Thread that no issue was drafted — it never pretends. Once the
            token exists, routing that thought again drafts the issue for real.
          </li>
          <li>
            <strong>A Project needs a repository</strong> before its ideas can
            become issues. A Project without one records the spec and tells you
            the handoff is not live.
          </li>
          <li>
            <strong>The task list arrives with the next change</strong> — until
            then <kbd className="manual-key">t</kbd> records the route but has
            nowhere yet to show it.
          </li>
        </ul>
      </section>

      <footer className="manual-colophon">
        <span>Route, don&rsquo;t review · ADR 0017</span>
        <span>docs/desk.md</span>
      </footer>

      <AppNav />
    </main>
  );
}
