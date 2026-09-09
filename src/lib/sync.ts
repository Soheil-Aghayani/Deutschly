export interface SyncResponse {
  room: string;
  updatedAt: string;
  state: unknown;
}

export class SyncRequestError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "SyncRequestError";
    this.status = status;
  }
}

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REQUEST_TIMEOUT_MS = 10_000;

export function createSyncRoom(): string {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(bytes, (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join("");
  }

  return Array.from({ length: 8 }, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join("");
}

export function normalizeSyncRoom(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
}

export function syncHealthUrl(endpoint: string): string {
  const normalizedEndpoint = endpoint.trim() || "/api/sync";
  const fallbackOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost";

  try {
    const url = new URL(normalizedEndpoint, fallbackOrigin);
    if (url.pathname.endsWith("/api/sync")) {
      url.pathname = `${url.pathname.slice(0, -9)}/api/health`;
    } else if (url.pathname === "/api" || url.pathname.endsWith("/api/")) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/health`;
    } else {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/api/health`;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return normalizedEndpoint.replace(/\/api\/sync\/?$/, "/api/health");
  }
}

function syncUrl(endpoint: string, room: string): string {
  const normalizedEndpoint = endpoint.trim() || "/api/sync";
  const separator = normalizedEndpoint.includes("?") ? "&" : "?";
  return `${normalizedEndpoint}${separator}room=${encodeURIComponent(normalizeSyncRoom(room))}`;
}

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Keep the transport error useful even if a proxy returned an HTML page.
  }

  if (!response.ok) {
    const message = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : `Sync request failed (${response.status})`;
    throw new SyncRequestError(message, response.status);
  }

  if (typeof payload !== "object" || payload === null) {
    throw new SyncRequestError("The sync server returned an invalid response.", response.status);
  }

  return payload as Record<string, unknown>;
}

function parseSyncResponse(payload: Record<string, unknown>): SyncResponse {
  if (typeof payload.room !== "string" || typeof payload.updatedAt !== "string" || !("state" in payload)) {
    throw new SyncRequestError("The sync server returned an incomplete document.");
  }

  return {
    room: payload.room,
    updatedAt: payload.updatedAt,
    state: payload.state,
  };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new SyncRequestError("The sync server did not respond in time.", 0);
    }
    throw new SyncRequestError("The sync server could not be reached.", 0);
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export async function pullSync(endpoint: string, room: string): Promise<SyncResponse | null> {
  const response = await fetchWithTimeout(syncUrl(endpoint, room), {
    headers: { Accept: "application/json" },
  });

  if (response.status === 404) return null;
  return parseSyncResponse(await readResponse(response));
}

export async function pushSync(endpoint: string, room: string, state: unknown): Promise<SyncResponse> {
  const response = await fetchWithTimeout(syncUrl(endpoint, room), {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ state }),
  });

  return parseSyncResponse(await readResponse(response));
}

export async function checkSyncHealth(endpoint: string): Promise<void> {
  const response = await fetchWithTimeout(syncHealthUrl(endpoint), {
    headers: { Accept: "application/json" },
  });
  const payload = await readResponse(response);
  if (payload.status !== "ok") {
    throw new SyncRequestError("The sync server is online but did not identify itself as Deutschly.");
  }
}
