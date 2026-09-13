import { describe, expect, it } from "vitest";
import { encodeNativeAuthPass, parseNativeAuthPass } from "./firebase";
import type { FirebaseUserSummary } from "./firebase";

describe("NativeAuthPass encoding and decoding", () => {
  const mockUser: FirebaseUserSummary = {
    uid: "google-12345",
    displayName: "Anna Schmidt",
    email: "anna@example.com",
    photoURL: "https://example.com/photo.jpg",
    provider: "google.com",
  };

  it("encodes and parses a valid auth pass with idToken", () => {
    const token = "mock-id-token-abc-xyz";
    const accessToken = "mock-access-token-123";
    const encoded = encodeNativeAuthPass(mockUser, token, accessToken);

    expect(encoded.startsWith("deutschly-auth:")).toBe(true);

    const parsed = parseNativeAuthPass(encoded);
    expect(parsed).not.toBeNull();
    expect(parsed?.uid).toBe(mockUser.uid);
    expect(parsed?.email).toBe(mockUser.email);
    expect(parsed?.displayName).toBe(mockUser.displayName);
    expect(parsed?.idToken).toBe(token);
    expect(parsed?.accessToken).toBe(accessToken);
  });

  it("handles empty or invalid auth passes safely", () => {
    expect(parseNativeAuthPass("")).toBeNull();
    expect(parseNativeAuthPass("invalid-pass")).toBeNull();
    expect(parseNativeAuthPass("deutschly-auth:invalid-base64")).toBeNull();
  });
});
