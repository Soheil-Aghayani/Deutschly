export interface AndroidInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

declare global {
  interface Window {
    __DEUTSCHLY_ANDROID_INSETS__?: AndroidInsets;
    DeutschlyAndroidInsets?: {
      getInsets: () => string;
    };
  }
}

const INSETS_EVENT = "deutschly:android-insets";

function normalizeInsets(value: unknown): AndroidInsets | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<Record<keyof AndroidInsets, unknown>>;
  const values = [source.top, source.right, source.bottom, source.left];
  if (!values.every((entry) => typeof entry === "number" && Number.isFinite(entry))) return null;
  return {
    top: Math.max(0, source.top as number),
    right: Math.max(0, source.right as number),
    bottom: Math.max(0, source.bottom as number),
    left: Math.max(0, source.left as number),
  };
}

export function applyAndroidInsets(insets: AndroidInsets): void {
  const root = document.documentElement;
  root.style.setProperty("--android-safe-top", `${insets.top}px`);
  root.style.setProperty("--android-safe-right", `${insets.right}px`);
  root.style.setProperty("--android-safe-bottom", `${insets.bottom}px`);
  root.style.setProperty("--android-safe-left", `${insets.left}px`);
  window.__DEUTSCHLY_ANDROID_INSETS__ = insets;
}

function readNativeInsets(): AndroidInsets | null {
  const fromGlobal = normalizeInsets(window.__DEUTSCHLY_ANDROID_INSETS__);
  if (fromGlobal) return fromGlobal;

  const bridge = window.DeutschlyAndroidInsets;
  if (!bridge) return null;
  try {
    return normalizeInsets(JSON.parse(bridge.getInsets()) as unknown);
  } catch {
    return null;
  }
}

export function initializeAndroidInsets(): () => void {
  const handleInsets = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    const insets = normalizeInsets(detail);
    if (insets) applyAndroidInsets(insets);
  };

  window.addEventListener(INSETS_EVENT, handleInsets);
  const initialInsets = readNativeInsets();
  if (initialInsets) applyAndroidInsets(initialInsets);

  // The native bridge can become available just after the document starts.
  // Poll briefly so the first layout is corrected even when the WebView emits
  // its initial inset callback before React has mounted.
  let attempts = 0;
  const poll = window.setInterval(() => {
    const insets = readNativeInsets();
    if (insets) applyAndroidInsets(insets);
    attempts += 1;
    if (attempts >= 20) window.clearInterval(poll);
  }, 150);

  return () => {
    window.removeEventListener(INSETS_EVENT, handleInsets);
    window.clearInterval(poll);
  };
}
