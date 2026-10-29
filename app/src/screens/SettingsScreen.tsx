import { Fragment, useState } from 'react';
import { LinkedAs, NotificationsOff, Screen, Toggle } from '../components';
import { Plus, Trash } from 'pixelarticons/react';
import { api, usingMockApi, type PairedServer, type QuietHours, type QuietPeriod } from '../lib/api';
import { sendTestNotification, unregister } from '../lib/notifications';
import { paths } from '../lib/router';
import { useInfo } from '../lib/useInfo';
import { useSettings } from '../lib/useSettings';
import { FriendsSection } from './FriendsSection';

export function SettingsScreen({ server, onLeft }: { server: PairedServer; onLeft: () => void }) {
  const { settings, error, update } = useSettings(server);
  const info = useInfo(server);
  const [leaving, setLeaving] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  // The quiet period whose last change was refused.
  const [invalidPeriod, setInvalidPeriod] = useState<number | null>(null);

  // Demo mode only for now: real pushes need the mod.
  async function testNotification() {
    setTestError(null);
    try {
      const { players } = await api.online(server);
      await sendTestNotification(server, players[0]);
    } catch (err) {
      setTestError((err as Error).message);
    }
  }

  function updateQuietHours(changes: Partial<QuietHours>) {
    if (!settings) return;
    update({ quietHours: { ...settings.quietHours, ...changes } });
  }

  function updatePeriods(change: (periods: QuietPeriod[]) => QuietPeriod[]) {
    if (!settings) return;
    updateQuietHours({ periods: change(settings.quietHours.periods) });
  }

  /** Refuses a period that starts when it ends (the server would too); the input then goes back. */
  function updatePeriod(i: number, changes: Partial<QuietPeriod>) {
    if (!settings) return;
    const period = { ...settings.quietHours.periods[i], ...changes };
    if (period.start === period.end) {
      setInvalidPeriod(i);
      return;
    }
    setInvalidPeriod(null);
    updatePeriods((ps) => ps.map((p, j) => (j === i ? period : p)));
  }

  async function leave() {
    if (!confirm(`Leave ${server.name}? You'll stop getting its notifications and it will be removed from this app.`)) {
      return;
    }
    setLeaving(true);
    // Best effort: forget the server locally even if it can't be reached.
    await api.unpair(server).catch(() => {});
    // Even if the server wasn't told, so its pushes stop arriving.
    await unregister(server.id).catch(() => {});
    onLeft();
  }

  return (
    <Screen title="Settings" back={paths.server(server.id)}>
      <section className="section">
        <h2>Notifications</h2>
        <NotificationsOff server={server} />
        {!settings && !error && <p className="muted">Loading…</p>}
        {settings && (
          <div className="settings-group">
            <Toggle
              label="When someone joins"
              checked={settings.notifyJoins}
              onChange={(notifyJoins) => update({ notifyJoins })}
            />
            <Toggle
              label="When someone leaves"
              description="Sent a few minutes later, so quick reconnects don't count"
              checked={settings.notifyLeaves}
              onChange={(notifyLeaves) => update({ notifyLeaves })}
            />
            <Toggle
              label="When the server starts or stops"
              checked={settings.notifyServerStatus}
              onChange={(notifyServerStatus) => update({ notifyServerStatus })}
            />
            <Toggle
              label="Not while I'm playing"
              description="Stay quiet while you're on this server yourself"
              checked={settings.quietWhileOnline}
              disabled={!settings.notifyJoins && !settings.notifyLeaves && !settings.notifyServerStatus}
              onChange={(quietWhileOnline) => update({ quietWhileOnline })}
            />
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {usingMockApi && (
          <>
            <button className="button" onClick={testNotification}>
              Send a test notification
            </button>
            {testError && <p className="error">{testError}</p>}
          </>
        )}
      </section>

      {settings && (
        <FriendsSection
          server={server}
          friends={settings.friends}
          disabled={!settings.notifyJoins && !settings.notifyLeaves}
          onChange={(friends) => update({ friends })}
        />
      )}

      {settings && (
        <section className="section">
          <h2>Quiet hours</h2>
          <div className="settings-group">
            <Toggle
              label="Quiet hours"
              description="No notifications at all during these times, every day"
              checked={settings.quietHours.enabled}
              onChange={(enabled) => updateQuietHours({ enabled })}
            />
            {settings.quietHours.enabled && (
              <>
                {settings.quietHours.periods.map((period, i) => (
                  <Fragment key={i}>
                    <div className="time-row">
                      <label className="field">
                        From
                        <input
                          type="time"
                          value={period.start}
                          onChange={(e) => e.target.value && updatePeriod(i, { start: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        To
                        <input
                          type="time"
                          value={period.end}
                          onChange={(e) => e.target.value && updatePeriod(i, { end: e.target.value })}
                        />
                      </label>
                      <button
                        className="icon-button remove-period"
                        aria-label="Remove this period"
                        onClick={() => {
                          setInvalidPeriod(null);
                          updatePeriods((ps) => ps.filter((_, j) => j !== i));
                        }}
                      >
                        <Trash />
                      </button>
                    </div>
                    {invalidPeriod === i && (
                      <p className="error small period-error">A period can't start and end at the same time.</p>
                    )}
                  </Fragment>
                ))}
                <button
                  className="group-button"
                  onClick={() => updatePeriods((ps) => [...ps, { start: '12:00', end: '14:00' }])}
                >
                  <Plus /> Add a period
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {info && (
        <section className="section">
          <h2>Server</h2>
          <p>Minecraft {info.version}</p>
        </section>
      )}

      <section className="section">
        <h2>This device</h2>
        <p>{server.deviceName}</p>
        <LinkedAs player={server.player} />
        <p className="muted small">Paired on {new Date(server.pairedAt).toLocaleDateString()}</p>
      </section>

      <button className="button danger" onClick={leave} disabled={leaving}>
        {leaving ? 'Leaving…' : `Leave ${server.name}`}
      </button>
    </Screen>
  );
}
