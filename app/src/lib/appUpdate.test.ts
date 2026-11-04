import { afterEach, describe, expect, it, vi } from "vitest";
import { deployedVersion } from "./appUpdate";

function serve(response: Response | Error) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deployedVersion", () => {
  it("reads the version, skipping the HTTP cache", async () => {
    serve(Response.json({ version: "0.0.3" }));
    expect(await deployedVersion()).toBe("0.0.3");
    expect(fetch).toHaveBeenCalledWith("./version.json", { cache: "no-store" });
  });

  it("is undefined when it can't be told", async () => {
    serve(new Response("Not found", { status: 404 }));
    expect(await deployedVersion()).toBeUndefined();
    serve(new Response("<html>"));
    expect(await deployedVersion()).toBeUndefined();
    serve(Response.json({ version: 3 }));
    expect(await deployedVersion()).toBeUndefined();
    serve(new TypeError("offline"));
    expect(await deployedVersion()).toBeUndefined();
  });
});
