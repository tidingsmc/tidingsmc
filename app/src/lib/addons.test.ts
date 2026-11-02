import { describe, expect, it } from "vitest";
import {
  buildTree,
  chatTime,
  refreshDelay,
  splitMentions,
  type TreeItem,
} from "./addons";

const shape = (items: TreeItem[]): unknown[] =>
  items.map((i) =>
    i.children.length ? [i.node.id, shape(i.children)] : i.node.id,
  );

describe("buildTree", () => {
  it("nests nodes under their parents, in the order given", () => {
    const tree = buildTree([
      { id: "root", title: "Minecraft" },
      { id: "stone", parent: "root", title: "Stone Age" },
      { id: "upgrade", parent: "stone", title: "Getting an Upgrade" },
      { id: "smelt", parent: "root", title: "Hot Stuff" },
      { id: "nether", title: "Nether" },
    ]);

    expect(shape(tree)).toEqual([
      ["root", [["stone", ["upgrade"]], "smelt"]],
      "nether",
    ]);
  });

  it("shows a node whose parent isn't listed before it at the top", () => {
    const tree = buildTree([
      { id: "child", parent: "later", title: "Child" },
      { id: "later", title: "Later" },
      { id: "orphan", parent: "nowhere", title: "Orphan" },
    ]);

    expect(shape(tree)).toEqual(["child", "later", "orphan"]);
  });

  it("can't loop, and drops what isn't a node", () => {
    const tree = buildTree([
      { id: "a", parent: "b", title: "A" },
      { id: "b", parent: "a", title: "B" },
      { id: "a", title: "Duplicate" },
      { title: "No ID" },
      null,
      "nonsense",
    ]);

    expect(shape(tree)).toEqual([["a", ["b"]]]);
  });

  it("shows a node that is its own parent at the top level, looping back to itself", () => {
    const tree = buildTree([
      { id: "a", parent: "a", title: "A" },
      { id: "b", parent: "a", title: "B" },
    ]);

    expect(shape(tree)).toEqual([["a", ["b"]]]);
    expect(tree[0].loops).toBe(true);
    expect(tree[0].children[0].loops).toBeUndefined();
  });

  it("is empty for anything but a list", () => {
    expect(buildTree(undefined)).toEqual([]);
    expect(buildTree({ id: "a" })).toEqual([]);
  });
});

describe("refreshDelay", () => {
  const delay = (refresh: unknown) =>
    refreshDelay({ version: 3, blocks: [], refresh } as never);

  it("is the view's rate in milliseconds", () => {
    expect(delay(3)).toBe(3000);
    expect(delay(2.5)).toBe(2500);
  });

  it("is null when the view doesn't refresh", () => {
    for (const refresh of [undefined, 0, -3, NaN, Infinity, "3", null])
      expect(delay(refresh)).toBeNull();
  });

  it("stays within the allowed rates", () => {
    expect(delay(0.1)).toBe(2000);
    expect(delay(1e9)).toBe(3_600_000);
  });
});

describe("splitMentions", () => {
  it("splits out @names", () => {
    expect(splitMentions("hi @Steve, and @alex_2!")).toEqual([
      { text: "hi ", mention: false },
      { text: "@Steve", mention: true },
      { text: ", and ", mention: false },
      { text: "@alex_2", mention: true },
      { text: "!", mention: false },
    ]);
  });

  it("leaves emails and short names alone", () => {
    expect(splitMentions("me@example.com @ab @@Steve")).toEqual([
      { text: "me@example.com @ab @@Steve", mention: false },
    ]);
  });

  it("handles a mention alone and empty text", () => {
    expect(splitMentions("@Steve")).toEqual([
      { text: "@Steve", mention: true },
    ]);
    expect(splitMentions("")).toEqual([]);
  });
});

describe("chatTime", () => {
  it("is hh:mm in the local time zone", () => {
    expect(chatTime(new Date(2026, 10, 2, 9, 5, 7).getTime())).toBe("09:05");
    expect(chatTime(new Date(2026, 10, 2, 23, 59, 0).getTime())).toBe("23:59");
  });

  it("is empty without a valid time", () => {
    for (const time of [undefined, null, "12:00", NaN, Infinity, 1e20])
      expect(chatTime(time)).toBe("");
  });
});
