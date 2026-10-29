import { Plus } from 'pixelarticons/react';
import { OnlineSummary, Screen, ServerIcon, SettingsLink } from '../components';
import type { PairedServer } from '../lib/api';
import { paths } from '../lib/router';
import { useInfo } from '../lib/useInfo';
import { useOnline } from '../lib/useOnline';

export function ServerListScreen({ servers }: { servers: PairedServer[] }) {
  return (
    <Screen title="Tidings" logo action={<SettingsLink href={paths.appSettings} />}>
      {servers.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No servers yet</p>
          <p>
            Join a Minecraft server that has Tidings and scan the QR code on the map you get, or pair with a code.
          </p>
        </div>
      ) : (
        <ul className="server-list">
          {servers.map((server) => (
            <li key={server.id}>
              <ServerCard server={server} />
            </li>
          ))}
        </ul>
      )}
      <div className="bottom-bar">
        <a className="button primary" href={paths.pair}>
          <Plus /> Pair a server
        </a>
      </div>
    </Screen>
  );
}

function ServerCard({ server }: { server: PairedServer }) {
  const online = useOnline(server);
  const info = useInfo(server);
  return (
    <a className="card" href={paths.server(server.id)}>
      <div className="card-row">
        <ServerIcon name={server.name} icon={info?.icon} />
        <div className="card-main">
          <span className="card-title">{server.name}</span>
          <OnlineSummary state={online} />
        </div>
      </div>
    </a>
  );
}
