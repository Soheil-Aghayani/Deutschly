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

export async function pullSync(endpoint: string, room: string): Promise<SyncResponse | null> {
  const response = await fetch(syncUrl(endpoint, room), {
    headers: { Accept: "application/json" },
  });

  if (response.status === 404) return null;
  return parseSyncResponse(await readResponse(response));
}

export async function pushSync(endpoint: string, room: string, state: unknown): Promise<SyncResponse> {
  const response = await fetch(syncUrl(endpoint, room), {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ state }),
  });

  return parseSyncResponse(await readResponse(response));
}
