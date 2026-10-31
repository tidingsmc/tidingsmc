import { describe, expect, it } from "vitest";
import { safeSkinUrl } from "./util";

describe("safeSkinUrl", () => {
  // Game profiles list skins as http://, which a secure page can't load.
  it("loads Mojang's skins over HTTPS", () => {
    expect(safeSkinUrl("http://textures.minecraft.net/texture/abc")).toBe(
      "https://textures.minecraft.net/texture/abc",
    );
    expect(safeSkinUrl("https://textures.minecraft.net/texture/abc")).toBe(
      "https://textures.minecraft.net/texture/abc",
    );
  });

  // Skin URLs come from the server: it mustn't make the app or the service worker fetch anything else.
  it("refuses every other host", () => {
    for (const url of [
      "https://example.com/skin.png",
      "https://textures.minecraft.net.example.com/texture/abc",
      "https://example.com/?textures.minecraft.net",
      "https://textures.minecraft.net@example.com/texture/abc",
    ]) {
      expect(safeSkinUrl(url)).toBeUndefined();
    }
  });

  it("refuses what isn't a URL", () => {
    expect(safeSkinUrl("textures.minecraft.net/texture/abc")).toBeUndefined();
    expect(safeSkinUrl("")).toBeUndefined();
    expect(safeSkinUrl(undefined)).toBeUndefined();
  });
});
