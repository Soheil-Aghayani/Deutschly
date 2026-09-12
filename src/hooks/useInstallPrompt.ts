import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const PWA_INSTALLED_KEY = "deutschly:pwa:installed:v1";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isStandaloneMode(): boolean {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  const displayModes = ["standalone", "minimal-ui", "fullscreen", "window-controls-overlay"];
  const displayModeMatches = typeof window.matchMedia === "function"
    && displayModes.some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches);
  return displayModeMatches
    || navigatorWithStandalone.standalone === true
    || document.referrer.startsWith("android-app://");
}

function hasInstallMarker(): boolean {
  try {
    return window.localStorage.getItem(PWA_INSTALLED_KEY) === "true";
  } catch {
    return false;
  }
}

function markInstalled(): void {
  try {
    window.localStorage.setItem(PWA_INSTALLED_KEY, "true");
  } catch {
    // Some embedded browsers expose no writable local storage.
  }
}

function isIosDevice(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isMobileDevice(): boolean {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // The native Android/Desktop shell is already installed. Chromium can
    // still expose the PWA install event inside its WebView, but showing that
    // prompt would be both incorrect and confusing to native users.
    if (isTauriRuntime()) {
      setIsInstalled(true);
      setIsIos(false);
      setIsMobile(false);
      return;
    }

    const refreshInstalledState = () => setIsInstalled(isStandaloneMode() || hasInstallMarker());
    refreshInstalledState();
    setIsIos(isIosDevice());
    setIsMobile(isMobileDevice());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      markInstalled();
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const displayModeQueries = typeof window.matchMedia === "function"
      ? ["standalone", "minimal-ui", "fullscreen", "window-controls-overlay"].map((mode) => window.matchMedia(`(display-mode: ${mode})`))
      : [];
    displayModeQueries.forEach((query) => query.addEventListener?.("change", refreshInstalledState));
    window.addEventListener("focus", refreshInstalledState);
    document.addEventListener("visibilitychange", refreshInstalledState);

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      displayModeQueries.forEach((query) => query.removeEventListener?.("change", refreshInstalledState));
      window.removeEventListener("focus", refreshInstalledState);
      document.removeEventListener("visibilitychange", refreshInstalledState);
    };
  }, []);

  const install = async () => {
    if (isTauriRuntime() || !deferredPrompt) return false;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") {
      markInstalled();
      setIsInstalled(true);
      return true;
    }
    return false;
  };

  return {
    canInstall: Boolean(deferredPrompt),
    install,
    isInstalled,
    isIos,
    isMobile,
  };
}
