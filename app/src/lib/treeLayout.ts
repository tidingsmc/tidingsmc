// Where each node of a tree block goes, drawn left to right like Minecraft's advancement screen:
// depth across, each leaf on its own row, a parent level with the middle of its children.

import type { TreeItem } from "./addons";

export interface PlacedNode {
  item: TreeItem;
  /** Depth, from 0. */
  column: number;
  /** From 0; a parent between two rows gets half a row. */
  row: number;
}

export interface TreeLayout {
  /** Parents before their children. */
  nodes: PlacedNode[];
  /** By index in `nodes`; `from` and `to` are the same for a node that is its own parent. */
  edges: { from: number; to: number }[];
  columns: number;
  rows: number;
}

export function layoutTree(roots: TreeItem[]): TreeLayout {
  const nodes: PlacedNode[] = [];
  const edges: { from: number; to: number }[] = [];
  let nextRow = 0;
  let columns = 0;

  function place(item: TreeItem, column: number): number {
    const index = nodes.length;
    const node: PlacedNode = { item, column, row: 0 };
    nodes.push(node);
    columns = Math.max(columns, column + 1);
    if (item.loops) edges.push({ from: index, to: index });
    if (item.children.length === 0) {
      node.row = nextRow++;
      return index;
    }
    const children = item.children.map((child) => place(child, column + 1));
    for (const child of children) edges.push({ from: index, to: child });
    const first = nodes[children[0]].row;
    const last = nodes[children[children.length - 1]].row;
    node.row = (first + last) / 2;
    return index;
  }

  for (const root of roots) place(root, 0);
  return { nodes, edges, columns, rows: nextRow };
}
