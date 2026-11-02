import type { ReactNode } from "react";
import { BellRing, ChevronLeft } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import { paths } from "../lib/router";
import { useWide } from "../lib/useWide";

interface ScreenProps {
  title: string;
  back?: string;
  action?: ReactNode;
  logo?: boolean;
  narrow?: boolean;
  centered?: boolean;
  children: ReactNode;
}

export function Screen({
  title,
  back,
  action,
  logo,
  narrow,
  centered,
  children,
}: ScreenProps) {
  const { t } = useTranslation();
  const wide = useWide();
  // On a wide window the sidebar lists the servers
  const backLink = wide && back === paths.servers ? undefined : back;
  return (
    <>
      <header className="topbar">
        {backLink && (
          <a
            className="back"
            href={backLink}
            aria-label={t("common.back")}
            title={t("common.back")}
          >
            <ChevronLeft />
          </a>
        )}
        {logo && !wide && <BellRing className="logo" aria-hidden />}
        <h1>{title}</h1>
        {action}
      </header>
      <main
        className={["content", narrow && "narrow", centered && "middle"]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </main>
    </>
  );
}
