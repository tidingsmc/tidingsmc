import { Fragment, useState } from "react";
import { Plus, Trash } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import { NotificationsOff, Screen, Toggle } from "../components";
import type { PairedServer, QuietHours, QuietPeriod } from "../lib/api";
import { useAppWideSettings } from "../lib/appWideSettings";
import { errorText } from "../lib/i18n";
import { paths } from "../lib/router";

export function NotificationSettingsScreen({
  servers,
}: {
  servers: PairedServer[];
}) {
  const { t } = useTranslation();
  return (
    <Screen title={t("settings.notifications")} back={paths.appSettings} narrow>
      <NotificationSettings servers={servers} />
    </Screen>
  );
}

export function NotificationSettings({ servers }: { servers: PairedServer[] }) {
  const { t } = useTranslation();
  const {
    settings,
    update: setSettings,
    failures,
  } = useAppWideSettings(servers);
  const { quietHours } = settings;
  const [invalidPeriod, setInvalidPeriod] = useState<number | null>(null);

  function update(changes: Partial<QuietHours>) {
    setSettings({ quietHours: { ...quietHours, ...changes } });
  }

  function updatePeriods(change: (periods: QuietPeriod[]) => QuietPeriod[]) {
    update({ periods: change(quietHours.periods) });
  }

  function updatePeriod(i: number, changes: Partial<QuietPeriod>) {
    const period = { ...quietHours.periods[i], ...changes };
    if (period.start === period.end) {
      setInvalidPeriod(i);
      return;
    }
    setInvalidPeriod(null);
    updatePeriods((ps) => ps.map((p, j) => (j === i ? period : p)));
  }

  return (
    <>
      <NotificationsOff servers={servers} />
      {failures.map(({ server, error }) => (
        <p key={server.id} className="error small" role="alert">
          {t("errors.couldntSave", {
            reason:
              servers.length > 1
                ? t("common.labelValue", {
                    label: server.name,
                    value: errorText(error, t),
                  })
                : errorText(error, t),
          })}
        </p>
      ))}
      <div className="settings-group">
        <Toggle
          label={t("settings.quietWhileOnline")}
          checked={settings.quietWhileOnline}
          onChange={(quietWhileOnline) => setSettings({ quietWhileOnline })}
        />
      </div>
      <div className="settings-group">
        <Toggle
          label={t("settings.quietHours")}
          checked={quietHours.enabled}
          onChange={(enabled) => update({ enabled })}
        />
        {quietHours.enabled && (
          <>
            {quietHours.periods.map((period, i) => (
              <Fragment key={i}>
                <div className="time-row">
                  <label className="time-field">
                    {t("settings.from")}
                    <input
                      type="time"
                      value={period.start}
                      onChange={(e) =>
                        e.target.value &&
                        updatePeriod(i, { start: e.target.value })
                      }
                    />
                  </label>
                  <label className="time-field">
                    {t("settings.to")}
                    <input
                      type="time"
                      value={period.end}
                      onChange={(e) =>
                        e.target.value &&
                        updatePeriod(i, { end: e.target.value })
                      }
                    />
                  </label>
                  <button
                    className="icon-button"
                    aria-label={t("settings.removePeriod")}
                    title={t("settings.removePeriod")}
                    onClick={() => {
                      setInvalidPeriod(null);
                      updatePeriods((ps) => ps.filter((_, j) => j !== i));
                    }}
                  >
                    <Trash />
                  </button>
                </div>
                {invalidPeriod === i && (
                  <p className="error small period-error">
                    {t("settings.samePeriod")}
                  </p>
                )}
              </Fragment>
            ))}
            <button
              className="group-button"
              onClick={() =>
                updatePeriods((ps) => [...ps, { start: "12:00", end: "14:00" }])
              }
            >
              <Plus /> {t("settings.addPeriod")}
            </button>
          </>
        )}
      </div>
    </>
  );
}
