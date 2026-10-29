import { useEffect, useState } from 'react';
import { Plus, Trash } from 'pixelarticons/react';
import { Avatar, Toggle } from '../components';
import { api, type FriendFilter, type OnlinePlayer, type PairedServer } from '../lib/api';

interface Props {
  server: PairedServer;
  friends: FriendFilter;
  /** Join and leave notifications are both off, so the filter has nothing to filter. */
  disabled: boolean;
  onChange: (friends: FriendFilter) => void;
}

/** Everyone who has played on the server, fetched once the filter is on. */
function useKnownPlayers(server: PairedServer, enabled: boolean) {
  const [state, setState] = useState<{ players?: OnlinePlayer[]; error?: string }>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api.players(server).then(
      ({ players }) => !cancelled && setState({ players }),
      (err: Error) => !cancelled && setState({ error: err.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [server, enabled]);

  return state;
}

/** Join and leave notifications for chosen players only. */
export function FriendsSection({ server, friends, disabled, onChange }: Props) {
  const known = useKnownPlayers(server, friends.enabled);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  // Friends are stored with the name they had when picked; show their current name and skin when known.
  const knownPlayer = (uuid: string) => known.players?.find((p) => p.uuid === uuid);
  const isFriend = (uuid: string) => friends.players.some((f) => f.uuid === uuid);
  const search = query.trim().toLowerCase();
  const candidates = (known.players ?? [])
    .filter((p) => p.uuid !== server.player.uuid && !isFriend(p.uuid) && p.name.toLowerCase().includes(search))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  function closePicker() {
    setPicking(false);
    setQuery('');
  }

  return (
    <section className="section">
      <h2>Friends</h2>
      <div className="settings-group">
        <Toggle
          label="Only my friends"
          description="Join and leave notifications only for the players you pick"
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
              <p className="warning small group-note">No friends yet, so nobody joining or leaving is announced.</p>
            )}
            <ul className="friend-list">
              {friends.players.map((friend) => {
                const name = knownPlayer(friend.uuid)?.name ?? friend.name;
                return (
                  <li key={friend.uuid} className="friend-row">
                    <Avatar name={name} skinUrl={knownPlayer(friend.uuid)?.skinUrl} size={28} />
                    <span className="friend-name">{name}</span>
                    <button
                      className="icon-button remove-friend"
                      aria-label={`Remove ${name}`}
                      onClick={() => onChange({ ...friends, players: friends.players.filter((f) => f.uuid !== friend.uuid) })}
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
                  placeholder="Search players"
                  aria-label="Search players"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                />
                {known.error && <p className="error small group-note">{known.error}</p>}
                {!known.players && !known.error && <p className="muted small group-note">Loading players…</p>}
                {known.players && candidates.length === 0 && (
                  <p className="muted small group-note">
                    {search ? 'Nobody by that name has played here' : 'Everyone who has played here is already a friend'}
                  </p>
                )}
                <ul className="friend-list">
                  {candidates.map((player) => (
                    <li key={player.uuid}>
                      <button
                        className="friend-row friend-candidate"
                        onClick={() =>
                          onChange({ ...friends, players: [...friends.players, { uuid: player.uuid, name: player.name }] })
                        }
                      >
                        <Avatar name={player.name} skinUrl={player.skinUrl} size={28} />
                        <span className="friend-name">{player.name}</span>
                        <Plus aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
                <button className="group-button" onClick={closePicker}>
                  Done
                </button>
              </div>
            ) : (
              <button className="group-button" onClick={() => setPicking(true)}>
                <Plus /> Add a friend
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
