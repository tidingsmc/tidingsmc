import i18next from "i18next";
import { describe, expect, it } from "vitest";
import { i18nOptions } from "../locales";
import {
  ApiError,
  isUnreachable,
  normalizeServerUrl,
  worthRetrying,
} from "./api";
import { errorText } from "./i18n";

const i18n = i18next.createInstance();
i18n.init(i18nOptions("en"));

function errorOf(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    return errorText(err, i18n.t);
  }
  throw new Error("Expected an error");
}

describe("normalizeServerUrl", () => {
  it("adds https:// to what the player types", () => {
    expect(normalizeServerUrl("mc.example.com")).toBe("https://mc.example.com");
  });

  // Pairing again is refused by comparing this with the stored URL: the same server must come out the same.
  it("gives one URL per server however it's written", () => {
    for (const typed of [
      "mc.example.com",
      "  MC.Example.com  ",
      "https://mc.example.com/",
      "HTTPS://mc.example.com//",
      "https://mc.example.com:443",
    ]) {
      expect(normalizeServerUrl(typed)).toBe("https://mc.example.com");
    }
  });

  it("keeps a path, without its trailing slash", () => {
    expect(normalizeServerUrl("https://example.com/tidings/")).toBe(
      "https://example.com/tidings",
    );
  });

  it("keeps a port", () => {
    expect(normalizeServerUrl("mc.example.com:8443")).toBe(
      "https://mc.example.com:8443",
    );
  });

  it("allows plain HTTP to localhost only, for testing", () => {
    expect(normalizeServerUrl("localhost:8765")).toBe("http://localhost:8765");
    expect(normalizeServerUrl("http://localhost:8765/")).toBe(
      "http://localhost:8765",
    );
    expect(errorOf(() => normalizeServerUrl("http://mc.example.com"))).toBe(
      "The server address must start with https://",
    );
  });

  it("doesn't take a host that merely starts with localhost", () => {
    expect(normalizeServerUrl("localhost.example.com")).toBe(
      "https://localhost.example.com",
    );
  });

  it("refuses what isn't an address", () => {
    expect(errorOf(() => normalizeServerUrl("not an address"))).toBe(
      "Not a valid server address",
    );
    expect(errorOf(() => normalizeServerUrl(""))).toBe(
      "Not a valid server address",
    );
  });
});

describe("isUnreachable and worthRetrying", () => {
  const status = (status?: number) => new ApiError(() => "", status);

  it("no answer at all: unreachable, worth retrying", () => {
    expect(isUnreachable(status())).toBe(true);
    expect(worthRetrying(status())).toBe(true);
  });

  it("only the proxy answered: unreachable, worth retrying", () => {
    for (const code of [502, 503, 504, 520, 522, 530]) {
      expect(isUnreachable(status(code))).toBe(true);
      expect(worthRetrying(status(code))).toBe(true);
    }
  });

  it("the server failed or is busy: reachable, worth retrying", () => {
    for (const code of [500, 429]) {
      expect(isUnreachable(status(code))).toBe(false);
      expect(worthRetrying(status(code))).toBe(true);
    }
  });

  it("the server refused: asking again won't change it", () => {
    for (const code of [400, 401, 403, 404, 409, 413]) {
      expect(isUnreachable(status(code))).toBe(false);
      expect(worthRetrying(status(code))).toBe(false);
    }
  });

  it("other errors are neither", () => {
    expect(isUnreachable(new Error("boom"))).toBe(false);
    expect(worthRetrying(new Error("boom"))).toBe(false);
  });
});
