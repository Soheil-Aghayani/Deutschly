import { describe, expect, it } from "vitest";
import { isolateAvatarSvgMarkup } from "./avatarIsolation";

describe("isolateAvatarSvgMarkup", () => {
  it("namespaces SVG ids and url references correctly", () => {
    const input = '<svg><mask id="mask-id"><path id="path-id" /></mask><g mask="url(#mask-id)" clip-path="url(#clip0)"><use href="#path-id" /></g></svg>';
    const result = isolateAvatarSvgMarkup(input, "test123");

    expect(result).toContain('id="mask-id_test123"');
    expect(result).toContain('id="path-id_test123"');
    expect(result).toContain('mask="url(#mask-id_test123)"');
    expect(result).toContain('href="#path-id_test123"');
    expect(result).not.toContain('id="mask-id"');
    expect(result).not.toContain('mask="url(#mask-id)"');
  });

  it("handles empty or missing namespace safely", () => {
    const input = '<svg><mask id="mask-id"></mask></svg>';
    expect(isolateAvatarSvgMarkup(input, "")).toBe(input);
  });

  it("does not duplicate namespaces if already isolated", () => {
    const input = '<svg><mask id="mask-id_test123"></mask></svg>';
    const result = isolateAvatarSvgMarkup(input, "test123");
    expect(result).toBe(input);
  });
});
