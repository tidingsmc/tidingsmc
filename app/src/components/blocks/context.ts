import type { AddonLink } from "../../lib/addons";
import type { AddonAction } from "../../lib/api";

export interface BlockContext {
  href: (link: AddonLink) => string;
  run: (action: AddonAction) => Promise<void>;
  busy: boolean;
  newer: boolean;
}
