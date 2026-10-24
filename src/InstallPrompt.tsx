import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __installPrompt?: InstallEvent | null;
  }
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  const ua = navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem("ngf-install-dismissed") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (isStandalone()) return;
    const onReady = () => setDeferred(window.__installPrompt ?? null);
    const onInstalled = () => {
      setDeferred(null);
      setIosHint(false);
    };
    if (window.__installPrompt) setDeferred(window.__installPrompt);
    window.addEventListener("ngf-install-ready", onReady);
    window.addEventListener("ngf-installed", onInstalled);
    let timer: number | undefined;
    if (isIOS()) timer = window.setTimeout(() => setIosHint(true), 1500);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("ngf-install-ready", onReady);
      window.removeEventListener("ngf-installed", onInstalled);
    };
  }, []);

  if (hidden) return null;
  if (!deferred && !iosHint) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem("ngf-install-dismissed", "1");
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") setDeferred(null);
    window.__installPrompt = null;
  };

  return (
    <div className="install-prompt" role="dialog" aria-label="Install app">
      <img
        className="install-logo"
        src="/icons/icon-192.png?v=ngf2"
        alt="NGF Gym"
        width={48}
        height={48}
      />
      <div className="install-copy">
        <strong>Install NGF Gym</strong>
        <p>
          {deferred
            ? "Add the app to your home screen for full-screen, offline-ready access."
            : "Tap Share, then “Add to Home Screen” to install the app."}
        </p>
      </div>
      {deferred && (
        <button className="primary" onClick={() => void install()}>
          <Download size={16} />
          Install
        </button>
      )}
      <button
        className="install-dismiss"
        aria-label="Dismiss install prompt"
        onClick={dismiss}
      >
        <X size={16} />
      </button>
    </div>
  );
}
