import type { ReactNode } from "react";
import { BellRing, ChevronLeft } from "pixelarticons/react";
import { useTranslation } from "react-i18next";

interface ScreenProps {
  title: string;
  back?: string;
  action?: ReactNode;
  logo?: boolean;
  children: ReactNode;
}

export function Screen({ title, back, action, logo, children }: ScreenProps) {
  const { t } = useTranslation();
  return (
    <>
      <header className="topbar">
        {back && (
          <a className="back" href={back} aria-label={t("common.back")}>
            <ChevronLeft />
          </a>
        )}
        {logo && <BellRing className="logo" aria-hidden />}
        <h1>{title}</h1>
        {action}
      </header>
      <main className="content">{children}</main>
    </>
  );
}
