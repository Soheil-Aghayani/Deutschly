import { afterEach, describe, expect, it, vi } from "vitest";
import { createSyncRoom, normalizeSyncRoom, pullSync, pushSync, syncHealthUrl } from "./sync";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sync room helpers", () => {
  it("normalizes room codes for copy/paste", () => {
    expect(normalizeSyncRoom("ab-cd 12!")).toBe("ABCD12");
  });

  it("creates an eight-character room code", () => {
    const room = createSyncRoom();
    expect(room).toMatch(/^[A-Z2-9]{8}$/);
  });

  it("pushes a state to the normalized room endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ room: "ROOM12", updatedAt: "2026-09-09T00:00:00.000Z", state: { cards: [] } }), { status: 200 }));

    await pushSync("/api/sync", "room-12", { cards: [] });

    expect(fetchMock).toHaveBeenCalledWith("/api/sync?room=ROOM12", expect.objectContaining({ method: "PUT" }));
  });

  it("treats an empty room as a first sync", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "empty" }), { status: 404 }));

    await expect(pullSync("/api/sync", "ROOM123")).resolves.toBeNull();
  });
});

describe("sync health endpoint", () => {
  it("maps the app sync route to the server health route", () => {
    expect(syncHealthUrl("/api/sync")).toBe("http://localhost/api/health");
    expect(syncHealthUrl("http://192.168.1.20:8787/api/sync")).toBe("http://192.168.1.20:8787/api/health");
  });

  it("adds the API path when only a server origin is provided", () => {
    expect(syncHealthUrl("http://localhost:8787")).toBe("http://localhost:8787/api/health");
  });
});
