import type { TreeItem } from "./addons";

export interface PlacedNode {
  item: TreeItem;
  column: number;
  row: number;
}

export interface TreeLayout {
  nodes: PlacedNode[];
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
