import { describe, it, expect } from "vitest";
import { parseGroupChatId } from "../src/groups.js";

describe("parseGroupChatId", () => {
  it("extracts the group id from a v1 (unsuffixed) session key", () => {
    expect(parseGroupChatId("agent:abc-123:group-chat:gc_1715000000000_xyz")).toBe(
      "gc_1715000000000_xyz",
    );
  });

  it("strips the cap-rotation version suffix", () => {
    expect(parseGroupChatId("agent:abc-123:group-chat:gc_1715000000000_xyz:v2")).toBe(
      "gc_1715000000000_xyz",
    );
    expect(parseGroupChatId("agent:abc-123:group-chat:gc_1715000000000_xyz:v17")).toBe(
      "gc_1715000000000_xyz",
    );
  });

  it("returns null for non-group sessions", () => {
    expect(parseGroupChatId("agent:abc-123:main")).toBeNull();
    expect(parseGroupChatId("agent:abc-123")).toBeNull();
    expect(parseGroupChatId("")).toBeNull();
  });

  it("returns null when the marker has no trailing id", () => {
    expect(parseGroupChatId("agent:abc-123:group-chat:")).toBeNull();
  });
});
