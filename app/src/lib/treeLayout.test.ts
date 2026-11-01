import { describe, expect, it } from "vitest";
import { buildTree } from "./addons";
import { layoutTree } from "./treeLayout";

const tree = buildTree([
  { id: "root", title: "Minecraft" },
  { id: "stone", parent: "root", title: "Stone Age" },
  { id: "upgrade", parent: "stone", title: "Getting an Upgrade" },
  { id: "lava", parent: "stone", title: "Hot Stuff" },
  { id: "deeper", parent: "root", title: "We Need to Go Deeper" },
]);

const positions = (layout: ReturnType<typeof layoutTree>) =>
  Object.fromEntries(
    layout.nodes.map((n) => [n.item.node.id, [n.column, n.row]]),
  );

describe("layoutTree", () => {
  it("puts depth across and each leaf on its own row", () => {
    const layout = layoutTree(tree);

    expect(positions(layout)).toEqual({
      root: [0, 1.25],
      stone: [1, 0.5],
      upgrade: [2, 0],
      lava: [2, 1],
      deeper: [1, 2],
    });
    expect(layout.columns).toBe(3);
    expect(layout.rows).toBe(3);
  });

  it("links each parent to its children", () => {
    const layout = layoutTree(tree);
    const ids = layout.edges.map(({ from, to }) => [
      layout.nodes[from].item.node.id,
      layout.nodes[to].item.node.id,
    ]);

    expect(ids).toEqual([
      ["stone", "upgrade"],
      ["stone", "lava"],
      ["root", "stone"],
      ["root", "deeper"],
    ]);
  });

  it("stacks several roots", () => {
    const layout = layoutTree(
      buildTree([
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ]),
    );

    expect(positions(layout)).toEqual({ a: [0, 0], b: [0, 1] });
  });

  it("draws an arrow from a node that is its own parent back to itself", () => {
    const layout = layoutTree(
      buildTree([
        { id: "a", parent: "a", title: "A" },
        { id: "b", parent: "a", title: "B" },
      ]),
    );

    expect(layout.edges).toEqual([
      { from: 0, to: 0 },
      { from: 0, to: 1 },
    ]);
  });
});
