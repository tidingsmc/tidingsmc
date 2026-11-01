import {
  BookOpen,
  Calendar,
  Chart,
  Coins,
  Crown,
  Flag,
  Gamepad,
  Gift,
  Heart,
  Layout,
  Lightbulb,
  Mail,
  Map,
  Message,
  Server,
  Shield,
  Sliders,
  Star,
  Store,
  Sword,
  Trophy,
} from "pixelarticons/react";

// Mirrors dev.tidings.core.addon.Icon: add-ons pick one of these names, never their own image.
const ICONS = {
  default: Layout,
  chart: Chart,
  trophy: Trophy,
  map: Map,
  book: BookOpen,
  store: Store,
  coins: Coins,
  gift: Gift,
  calendar: Calendar,
  flag: Flag,
  mail: Mail,
  message: Message,
  star: Star,
  heart: Heart,
  sword: Sword,
  shield: Shield,
  crown: Crown,
  server: Server,
  gamepad: Gamepad,
  lightbulb: Lightbulb,
  sliders: Sliders,
};

/** An add-on tab's icon, "default" for names from a newer mod. */
export function AddonIcon({ name }: { name?: string }) {
  const Icon =
    name && Object.prototype.hasOwnProperty.call(ICONS, name)
      ? ICONS[name as keyof typeof ICONS]
      : ICONS.default;
  return <Icon aria-hidden />;
}
