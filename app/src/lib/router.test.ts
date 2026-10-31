import { describe, expect, it } from "vitest";
import { parseRoute, paths } from "./router";

describe("parseRoute", () => {
  // As TidingsMod.pair builds it: Java's URLEncoder for the address, the token as is.
  it("reads the pairing link from the in-game QR code", () => {
    const link =
      "https://tidingsmc.github.io/tidingsmc/#pair=https%3A%2F%2Fmc.example.com&code=Zm9vYmFyYmF6cXV4cXV1eA";

    expect(parseRoute(new URL(link).hash)).toEqual({
      name: "pair",
      url: "https://mc.example.com",
      code: "Zm9vYmFyYmF6cXV4cXV1eA",
    });
  });

  it("keeps an address with & or # whole, once the mod encoded it", () => {
    expect(
      parseRoute("#pair=https%3A%2F%2Fmc.example.com%2Fa%26b%23c&code=x"),
    ).toMatchObject({ url: "https://mc.example.com/a&b#c", code: "x" });
  });

  it("decodes spaces the way URLEncoder writes them", () => {
    expect(
      parseRoute("#pair=https%3A%2F%2Fexample.com%2Fmy+server&code=x"),
    ).toMatchObject({ url: "https://example.com/my server" });
  });

  it("reads a pairing link without a code", () => {
    expect(parseRoute("#pair=https%3A%2F%2Fmc.example.com")).toEqual({
      name: "pair",
      url: "https://mc.example.com",
      code: undefined,
    });
  });

  it("reads the pairing wizard's steps", () => {
    expect(parseRoute("#/pair")).toEqual({ name: "pair" });
    expect(parseRoute("#/pair/scan")).toEqual({ name: "pair", step: "scan" });
    expect(parseRoute("#/pair/code")).toEqual({ name: "pair", step: "code" });
    expect(parseRoute("#/pair/other")).toEqual({ name: "pair" });
  });

  it("falls back to the server list", () => {
    expect(parseRoute("")).toEqual({ name: "servers" });
    expect(parseRoute("#/")).toEqual({ name: "servers" });
    expect(parseRoute("#/nowhere")).toEqual({ name: "servers" });
    expect(parseRoute("#/server")).toEqual({ name: "servers" });
  });

  // The service worker builds this path itself when a notification is tapped (sw.ts, openServer).
  it("reads the path a tapped notification opens", () => {
    expect(parseRoute(`#/server/${encodeURIComponent("1f2e3d4c")}`)).toEqual({
      name: "server",
      id: "1f2e3d4c",
    });
  });

  it("reads back every path it builds, whatever the server ID", () => {
    const id = "odd id/with?chars#";

    expect(parseRoute(paths.server(id))).toEqual({ name: "server", id });
    expect(parseRoute(paths.settings(id))).toEqual({ name: "settings", id });
    expect(parseRoute(paths.appSettings)).toEqual({ name: "appSettings" });
    expect(parseRoute(paths.pairStep("code"))).toEqual({
      name: "pair",
      step: "code",
    });
    expect(parseRoute(paths.servers)).toEqual({ name: "servers" });
  });
});
