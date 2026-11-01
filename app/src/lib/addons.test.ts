import { describe, expect, it } from "vitest";
import { buildTree, type TreeItem } from "./addons";

/** The tree as nested IDs, to compare shapes. */
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
