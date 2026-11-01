// Demo mode's add-on, using every kind of block, like the vanilla one planned as an example.

import type {
  ActionResult,
  AddonInfo,
  AddonLink,
  AddonView,
  Block,
} from "./addons";
import type { AddonAction, LinkedPlayer } from "./api";
import { hashString } from "./util";

export const MOCK_ADDONS: AddonInfo[] = [
  {
    id: "mystats",
    title: "My stats",
    icon: "chart",
  },
];

const STATS = [
  { id: "playtime", label: "Playtime", unit: " h" },
  { id: "deaths", label: "Deaths", unit: "" },
  { id: "mobs", label: "Mobs killed", unit: "" },
];

const ADVANCEMENTS: {
  id: string;
  parent?: string;
  title: string;
  description: string;
  done: boolean;
  badge?: string;
}[] = [
  {
    id: "root",
    title: "Minecraft",
    description: "The heart and story of the game",
    done: true,
  },
  {
    id: "stone",
    parent: "root",
    title: "Stone Age",
    description: "Mine Stone with your new Pickaxe",
    done: true,
  },
  {
    id: "upgrade",
    parent: "stone",
    title: "Getting an Upgrade",
    description: "Construct a better Pickaxe",
    done: true,
  },
  {
    id: "iron",
    parent: "upgrade",
    title: "Acquire Hardware",
    description: "Smelt an Iron Ingot",
    done: true,
  },
  {
    id: "diamonds",
    parent: "iron",
    title: "Diamonds!",
    description: "Acquire diamonds",
    done: false,
  },
  {
    id: "deeper",
    parent: "diamonds",
    title: "We Need to Go Deeper",
    description: "Build, light and enter a Nether Portal",
    done: false,
  },
  {
    id: "lava",
    parent: "iron",
    title: "Hot Stuff",
    description: "Fill a Bucket with lava",
    done: false,
  },
  {
    id: "end",
    parent: "deeper",
    title: "The End?",
    description: "Enter the End Portal",
    done: false,
    badge: "Goal",
  },
];

function statValue(player: LinkedPlayer, stat: string): number {
  return hashString(`${player.name}/${stat}`) % 200;
}

export function mockAddonView(
  addon: string,
  link: AddonLink | null,
  players: LinkedPlayer[],
): AddonView {
  const [me] = players;
  if (addon !== "mystats") throw new Error(`No add-on ${addon}`);
  const blocks: Block[] = [];
  switch (link?.view ?? "home") {
    case "top": {
      const stat = STATS.find((s) => s.id === link?.params?.stat) ?? STATS[0];
      blocks.push(
        {
          type: "choices",
          items: STATS.map((s) => ({
            label: s.label,
            link: { view: "top", params: { stat: s.id } },
            selected: s === stat,
          })),
        },
        {
          type: "list",
          items: [...players]
            .sort((a, b) => statValue(b, stat.id) - statValue(a, stat.id))
            .map((p, i) => ({
              title: p.name,
              subtitle: i === 0 ? "Top player" : undefined,
              trailing: `${statValue(p, stat.id)}${stat.unit}`,
              player: p,
            })),
          empty: "Nobody played yet",
        },
      );
      return { version: 1, title: "Leaderboard", blocks };
    }
    case "advancements":
      blocks.push({
        type: "tree",
        nodes: ADVANCEMENTS.map((a) => {
          const parent = ADVANCEMENTS.find((p) => p.id === a.parent);
          return {
            id: a.id,
            parent: a.parent,
            title: a.title,
            subtitle: a.description,
            trailing: a.done ? "Oct 30" : undefined,
            state: a.done
              ? "done"
              : !parent || parent.done
                ? "available"
                : "locked",
            badge: a.badge,
          };
        }),
      });
      return { version: 2, title: "Advancements", blocks };
    default: {
      const done = ADVANCEMENTS.filter((a) => a.done).length;
      blocks.push(
        {
          type: "stats",
          items: STATS.map((s) => ({
            label: s.label,
            value: `${statValue(me, s.id)}${s.unit}`,
          })),
        },
        {
          type: "card",
          blocks: [
            {
              type: "progress",
              label: "Advancements",
              value: done,
              max: ADVANCEMENTS.length,
            },
            {
              type: "button",
              label: "See all",
              link: { view: "advancements" },
            },
          ],
        },
        { type: "button", label: "Leaderboard", link: { view: "top" } },
        { type: "heading", text: "Say something in game" },
        {
          type: "form",
          action: "say",
          submit: "Send",
          fields: [
            {
              type: "text",
              name: "message",
              label: "Message",
              placeholder: "On my way!",
              maxLength: 256,
            },
            {
              type: "select",
              name: "to",
              label: "To",
              options: [
                { value: "all", label: "Everyone" },
                { value: "friends", label: "Friends only" },
              ],
              value: "all",
            },
            { type: "toggle", name: "loud", label: "Ping them", value: false },
          ],
        },
        {
          type: "text",
          text: "Messages show in the chat as from you.",
          muted: true,
        },
        {
          type: "button",
          label: "Reset my stats",
          action: "reset",
          style: "danger",
          confirm: "Your stats will start from zero again.",
        },
        { type: "sparkles", text: "From a newer mod" } as unknown as Block,
      );
      return { version: 2, title: undefined, blocks };
    }
  }
}

export function mockAddonAction(
  addon: string,
  action: AddonAction,
): ActionResult | { error: string } {
  if (addon !== "mystats") return { error: `No add-on ${addon}` };
  switch (action.action) {
    case "say":
      if (!action.values?.message?.trim()) return { error: "Say what?" };
      return { message: `Sent to ${action.values.to}` };
    case "reset":
      return { error: "Only admins can reset stats" };
    default:
      return { error: "This action doesn't exist anymore" };
  }
}
