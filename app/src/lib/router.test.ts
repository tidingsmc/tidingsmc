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

  // The service worker builds this path itself when a notification is tapped (sw.ts, notificationclick).
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

  it("reads back add-on paths, with their view and params", () => {
    const id = "odd id/with?chars#";
    const params = { stat: "a&b=c?d#e", page: "2" };

    expect(parseRoute(paths.addon(id, { id: "mystats" }))).toEqual({
      name: "server",
      id,
      addon: { id: "mystats" },
    });
    expect(
      parseRoute(paths.addon(id, { id: "mystats", view: "top", params })),
    ).toEqual({
      name: "server",
      id,
      addon: { id: "mystats", view: "top", params },
    });
  });

  it("keeps the whole query when a hand-typed link has another ?", () => {
    expect(parseRoute("#/server/s/addon/mystats/top?q=a?b&page=2")).toEqual({
      name: "server",
      id: "s",
      addon: { id: "mystats", view: "top", params: { q: "a?b", page: "2" } },
    });
  });

  it("opens an add-on's tab when its link isn't one it could have sent", () => {
    expect(parseRoute("#/server/s/addon/mystats/..%2Fx")).toEqual({
      name: "server",
      id: "s",
      addon: { id: "mystats" },
    });
    expect(parseRoute("#/server/s/addon/Bad%20Id")).toEqual({
      name: "server",
      id: "s",
    });
    expect(parseRoute("#/server/s/addon/mystats/%E0")).toEqual({
      name: "server",
      id: "s",
      addon: { id: "mystats" },
    });
    expect(parseRoute("#/server/%E0/settings")).toEqual({ name: "servers" });
  });
});
