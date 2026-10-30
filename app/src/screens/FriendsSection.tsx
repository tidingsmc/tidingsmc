import { useEffect, useState } from "react";
import { Plus, Trash } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import { Avatar, Toggle } from "../components";
import {
  api,
  type FriendFilter,
  type OnlinePlayer,
  type PairedServer,
} from "../lib/api";
import { errorText } from "../lib/i18n";

interface Props {
  server: PairedServer;
  friends: FriendFilter;
  disabled: boolean;
  onChange: (friends: FriendFilter) => void;
}

function useKnownPlayers(server: PairedServer, enabled: boolean) {
  const [state, setState] = useState<{
    players?: OnlinePlayer[];
    error?: Error;
  }>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api.players(server).then(
      ({ players }) => !cancelled && setState({ players }),
      (err: Error) => !cancelled && setState({ error: err }),
    );
    return () => {
      cancelled = true;
    };
  }, [server, enabled]);

  return state;
}

export function FriendsSection({ server, friends, disabled, onChange }: Props) {
  const { t } = useTranslation();
  const known = useKnownPlayers(server, friends.enabled);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");

  const knownPlayer = (uuid: string) =>
    known.players?.find((p) => p.uuid === uuid);
  const isFriend = (uuid: string) =>
    friends.players.some((f) => f.uuid === uuid);
  const search = query.trim().toLowerCase();
  const candidates = (known.players ?? [])
    .filter(
      (p) =>
        p.uuid !== server.player.uuid &&
        !isFriend(p.uuid) &&
        p.name.toLowerCase().includes(search),
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );

  function closePicker() {
    setPicking(false);
    setQuery("");
  }

  return (
    <div className="settings-group">
      <Toggle
        label={t("friends.only")}
        checked={friends.enabled}
        disabled={disabled}
        onChange={(enabled) => {
          closePicker();
          onChange({ ...friends, enabled });
        }}
      />
      {friends.enabled && (
        <>
          {friends.players.length === 0 && !picking && (
            <p className="warning small group-note">{t("friends.none")}</p>
          )}
          <ul className="friend-list">
            {friends.players.map((friend) => {
              const name = knownPlayer(friend.uuid)?.name ?? friend.name;
              return (
                <li key={friend.uuid} className="friend-row">
                  <Avatar
                    name={name}
                    skinUrl={knownPlayer(friend.uuid)?.skinUrl}
                    size={28}
                  />
                  <span className="friend-name">{name}</span>
                  <button
                    className="icon-button remove-friend"
                    aria-label={t("friends.remove", { name })}
                    onClick={() =>
                      onChange({
                        ...friends,
                        players: friends.players.filter(
                          (f) => f.uuid !== friend.uuid,
                        ),
                      })
                    }
                  >
                    <Trash />
                  </button>
                </li>
              );
            })}
          </ul>
          {picking ? (
            <div className="friend-picker">
              <input
                className="friend-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("friends.search")}
                aria-label={t("friends.search")}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
              />
              {known.error && (
                <p className="error small group-note">
                  {errorText(known.error, t)}
                </p>
              )}
              {!known.players && !known.error && (
                <p className="muted small group-note">{t("friends.loading")}</p>
              )}
              {known.players && candidates.length === 0 && (
                <p className="muted small group-note">
                  {search ? t("friends.noMatch") : t("friends.allFriends")}
                </p>
              )}
              <ul className="friend-list">
                {candidates.map((player) => (
                  <li key={player.uuid}>
                    <button
                      className="friend-row friend-candidate"
                      onClick={() =>
                        onChange({
                          ...friends,
                          players: [
                            ...friends.players,
                            { uuid: player.uuid, name: player.name },
                          ],
                        })
                      }
                    >
                      <Avatar
                        name={player.name}
                        skinUrl={player.skinUrl}
                        size={28}
                      />
                      <span className="friend-name">{player.name}</span>
                      <Plus aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              <button className="group-button" onClick={closePicker}>
                {t("friends.done")}
              </button>
            </div>
          ) : (
            <button className="group-button" onClick={() => setPicking(true)}>
              <Plus /> {t("friends.add")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
