import { describe, expect, it } from "vitest";
import { readIcon, readImage } from "./icons";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("readIcon", () => {
  it("takes any library name, with the old aliases", () => {
    expect(readIcon("trophy")).toEqual({ kind: "name", name: "trophy" });
    expect(readIcon("arrow-right")).toEqual({
      kind: "name",
      name: "arrow-right",
    });
    expect(readIcon("book")).toEqual({ kind: "name", name: "book-open" });
    expect(readIcon("default")).toEqual({ kind: "name", name: "layout" });
  });

  it("takes base64 images", () => {
    expect(readIcon(PNG)).toEqual({ kind: "image", src: PNG });
    expect(readIcon("data:image/webp;base64,UklGRg==")).toEqual({
      kind: "image",
      src: "data:image/webp;base64,UklGRg==",
    });
  });

  it("takes image references", () => {
    const ref = "image:YQ9a5NduMyY2oXvTV_1s6Q";
    expect(readIcon(ref)).toEqual({ kind: "image", src: ref });
    expect(readImage(ref)).toBe(ref);
  });

  it("draws the default for anything else", () => {
    const fallback = { kind: "name", name: "layout" };
    for (const bad of [
      undefined,
      42,
      "",
      "Trophy",
      "../x",
      "x".repeat(65),
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/png,raw",
      'data:image/png;base64,abc"onerror',
      "https://example.com/x.png",
      `data:image/png;base64,${"A".repeat(30000)}`,
      "image:short",
      "image:YQ9a5NduMyY2oXvTV_1s6Q/../x",
      "image:YQ9a5NduMyY2oXvTV_1s6Q?",
    ]) {
      expect(readIcon(bad)).toEqual(fallback);
    }
  });
});

describe("readImage", () => {
  it("takes bigger images than icons do, but not other things", () => {
    const big = `data:image/png;base64,${"A".repeat(30000)}`;
    expect(readImage(big)).toBe(big);
    expect(readImage(`data:image/png;base64,${"A".repeat(90000)}`)).toBeNull();
    expect(readImage("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(readImage("https://example.com/x.png")).toBeNull();
    expect(readImage(undefined)).toBeNull();
  });
});
