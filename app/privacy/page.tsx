import Link from "next/link";

export const metadata = {
  title: "Privacy & data handling — Walking Thoughts",
};

export default function PrivacyPage() {
  return (
    <main className="privacy">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Walking Thoughts home">
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
          <span>Walking Thoughts</span>
        </Link>
      </header>

      <article className="privacy-body">
        <h1>Privacy &amp; data handling</h1>

        <section aria-label="Local first">
          <h2>Your device comes first</h2>
          <p>
            Every Capture commits to this device&rsquo;s storage before any
            network work begins. A Capture that says &ldquo;Saved locally&rdquo;
            is safe: losing connectivity, closing the app, or a failed
            synchronization never affects it.
          </p>
        </section>

        <section aria-label="Synchronization">
          <h2>When synchronization runs</h2>
          <p>
            Synchronization is dependable while the app is open and online
            (foreground). Synchronization while the app is closed is a
            best-effort browser enhancement, never a promise. Anything that
            has not synchronized yet simply waits on this device.
          </p>
          <p>
            Features that need connectivity — Enrichment, media
            synchronization, web research, notifications — say so in the
            interface and resume automatically when you are back online.
          </p>
        </section>

        <section aria-label="Cloud storage">
          <h2>Where synchronized content lives</h2>
          <p>
            Synchronized Threads are stored in a private Postgres database and
            original media in private object storage. Media is served only
            through this application&rsquo;s authenticated routes — there are
            no permanent public media URLs. Preview and production deployments
            use separate resources and separately vaulted credentials.
          </p>
        </section>

        <section aria-label="AI processing disclosure">
          <h2>AI processing</h2>
          <p>
            When a Thread is enriched, its complete history — text, supported
            original media, timestamps, and available location context — is
            sent through <strong>Vercel AI Gateway</strong> to the globally
            selected model provider. Each Enrichment records the exact gateway
            model that produced it. Enrichment may also perform web searches;
            source links are retained with the result.
          </p>
        </section>

        <section aria-label="Encryption">
          <h2>Encryption</h2>
          <p>
            All transport uses standard TLS encryption, and cloud providers
            encrypt stored data at rest.{" "}
            <strong>
              Walking Thoughts is not end-to-end encrypted
            </strong>
            : server-side Enrichment requires the service and its model
            providers to read synchronized content.
          </p>
        </section>

        <section aria-label="Access">
          <h2>Who can access it</h2>
          <p>
            The application admits only the configured allowed identity
            through Clerk authentication. Every server record and media object
            is scoped to that user.
          </p>
        </section>
      </article>

      <footer>
        <span>Local first</span>
        <span aria-hidden="true">·</span>
        <span>Private by default</span>
      </footer>
    </main>
  );
}
