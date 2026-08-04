"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "wt-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function alreadyInstalled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari when launched from the home screen.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

/**
 * In-app install path. Chrome on Android often never surfaces a menu entry
 * even when the site is installable (dismiss cooldown, engagement gates, or
 * UI that only offers "Add to Home screen" buried under share). When the
 * browser fires `beforeinstallprompt`, this shows a real Install control;
 * otherwise it shows the manual Chrome steps so the walker is not stuck
 * hunting the overflow menu.
 */
export function InstallAppPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (alreadyInstalled()) return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // Private mode can throw; still offer install.
    }

    setVisible(true);

    const onBip = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) return null;

  async function install() {
    if (!deferred || busy) return;
    setBusy(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setVisible(false);
      }
      setDeferred(null);
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  return (
    <aside className="install-prompt" role="region" aria-label="Install app">
      <div className="install-prompt-copy">
        <strong>Install Walking Thoughts</strong>
        {deferred ? (
          <span>Add it to your home screen for one-tap Capture on the trail.</span>
        ) : (
          <span>
            Chrome menu (⋮) → <em>Cast, save &amp; share</em> →{" "}
            <em>Install app</em> or <em>Add to Home screen</em>. Stay on this
            page about half a minute after signing in if the item is missing.
          </span>
        )}
      </div>
      <div className="install-prompt-actions">
        {deferred ? (
          <button
            type="button"
            className="install-prompt-primary"
            onClick={() => void install()}
            disabled={busy}
          >
            {busy ? "Installing…" : "Install"}
          </button>
        ) : null}
        <button
          type="button"
          className="install-prompt-dismiss"
          onClick={dismiss}
        >
          Not now
        </button>
      </div>
    </aside>
  );
}
