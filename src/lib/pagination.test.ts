import { describe, expect, it } from "vitest";
import { getPageSlice, getPaginationState } from "./pagination";

describe("pagination", () => {
  it("uses the requested page size and clamps invalid pages", () => {
    expect(getPaginationState(4, 3, 8)).toEqual({ totalPages: 3, page: 3, firstItem: 7, lastItem: 8 });
    expect(getPaginationState(0, 6, 13).page).toBe(1);
  });

  it("returns the correct mobile and desktop slices", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(getPageSlice(items, 2, 3)).toEqual([4, 5, 6]);
    expect(getPageSlice(items, 2, 6)).toEqual([7, 8]);
  });

  it("handles an empty collection", () => {
    expect(getPaginationState(1, 3, 0)).toEqual({ totalPages: 0, page: 1, firstItem: 0, lastItem: 0 });
    expect(getPageSlice([], 2, 3)).toEqual([]);
  });
});
