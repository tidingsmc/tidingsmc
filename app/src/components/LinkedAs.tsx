import { useTranslation } from "react-i18next";
import type { LinkedPlayer } from "../lib/api";
import { Avatar } from "./Avatar";

export function LinkedAs({ player }: { player: LinkedPlayer }) {
  const { t } = useTranslation();
  return (
    <span className="linked-as">
      <Avatar name={player.name} skinUrl={player.skinUrl} size={16} />
      {t("common.linkedAs", { name: player.name })}
    </span>
  );
}
