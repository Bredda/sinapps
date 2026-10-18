import { describe, expect, it } from "vitest";
import { formatCost, formatDuration, hostname } from "./format";

describe("format", () => {
  it("formats durations from sub-second to minutes", () => {
    expect(formatDuration(400, "en")).toBe("0.4s");
    expect(formatDuration(8400, "en")).toBe("8.4s");
    expect(formatDuration(23_000, "en")).toBe("23s");
    expect(formatDuration(124_000, "en")).toBe("2m 4s");
    expect(formatDuration(120_000, "en")).toBe("2m");
  });

  it("keeps meaningful digits for fractions of a cent", () => {
    expect(formatCost(0.0082, "en")).toBe("$0.0082");
    expect(formatCost(1.2345, "en")).toBe("$1.235");
  });

  it("shortens URLs to their host and leaves non-URLs alone", () => {
    expect(hostname("https://www.example.com/a/b?c=d")).toBe("example.com");
    expect(hostname("not a url")).toBe("not a url");
  });
});
