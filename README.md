# Tidings

Get a notification on your phone when friends join your Minecraft server.

Tidings is a server-side Forge mod plus one web app (PWA) for players. Players pair their phone with each server once, then get notified when someone joins and can see who's online, for every server they're paired with, from a single app.

Everything is self-hosted: there is no central Tidings service.

## How it works

```
 GitHub Pages (static)                       Each Minecraft server (self-hosted)
┌───────────────────────────┐              ┌───────────────────────────────────┐
│ Tidings PWA               │── HTTPS ───▶ │ Tidings Forge mod (server-only)   │
│  • list of paired servers │   API calls  │  • small HTTP API on a local port │
│  • who's online           │              │  • its own push key pair (VAPID)  │
│  • one service worker     │              │  • paired devices + subscriptions │
│    registration per server│              └───────────────┬───────────────────┘
└─────────────▲─────────────┘                              │ Web Push
              │                                            ▼
              └──────── Google / Mozilla / Apple push services
```

- **Server owners** add the mod and expose its HTTP port over HTTPS (Cloudflare Tunnel, Tailscale Funnel, or a reverse proxy such as Caddy), then set `public-url` in the config.
- **Pairing**: on first join (or `/tidings pair`), the player gets a map showing a QR code that opens the PWA with a single-use, short-lived pairing code. Without a camera, `/tidings pair code` gives the server's address and a 6-digit code to type instead. The player then approves the device in the game chat before it's paired.
- **Notifications**: the mod sends Web Push directly with its own key (encrypted per RFC 8291, signed with VAPID): when someone joins or leaves, and when the server starts or stops, depending on each device's settings. The PWA keeps one service worker registration per paired server (scope `/s/<serverId>/`), so one app can receive pushes from many servers.
- **Security**: every API call except pairing requires a per-device token (stored hashed on the server). Pairing codes expire, are single-use and rate-limited, and a device only pairs once its player approves it in game.

Not supported yet: rented hosting without a way to add HTTPS, and Aternos.

## Server setup

1. Put the mod jar in `mods/` and start the server once. It creates `config/tidings-common.toml` and keeps its data (server ID, push keys, paired devices) in `tidings/data.json`. Back that file up: losing it unpairs every device.
2. The API listens on `127.0.0.1:8765` (`port`, `bind-address`). Expose it over HTTPS and set `public-url` to that address. Set `app-url` to where the app is hosted: pairing QR codes open it. The server must also be able to make outgoing HTTPS requests, to the browsers' push services (Google, Mozilla, Apple).
3. On their first join, or with `/tidings pair`, players get a map with a QR code to scan with their phone. `/tidings pair code` gives the server's address and a 6-digit code to type in the app instead. `/tidings devices` lists their paired devices and unpairs them.

The API itself is described in `app/src/lib/api.ts`.

## Repository layout

| Path | What |
|---|---|
| `core/` | Plain Java 17, no Minecraft: pairing, tokens, push sending, HTTP API, storage |
| `forge/` | Forge 1.20.1 adapter: join/leave events, `/tidings` commands, QR code map |
| `app/` | The PWA: Vite + React + TypeScript |

## Development

Requirements: a JDK (17+; Gradle downloads Java 17 for Forge automatically) and Node 20+.

```sh
./gradlew :core:test          # core unit tests
./gradlew :forge:build        # mod jar in forge/build/libs/
./gradlew :forge:runServer    # dev Minecraft server with the mod (accept the EULA in forge/run/eula.txt)

cd app && npm install && npm run dev
```

The app uses fake servers in development (`VITE_MOCK_API=true` in `app/.env.development`). To talk to a real server instead, put `VITE_MOCK_API=false` in `app/.env.development.local`, then pair with `localhost:8765`.

### Testing on an Android phone

`adb reverse` makes the phone's `localhost` reach this computer over USB, so the app gets the secure context it needs (camera, service worker, push) without HTTPS:

1. Turn on USB debugging on the phone, plug it in and accept the prompt.
2. Forward the app (Vite) and the mod's API:

   ```sh
   adb devices                    # the phone should show as "device"
   adb reverse tcp:5173 tcp:5173  # app dev server
   adb reverse tcp:8765 tcp:8765  # Tidings API
   adb reverse --list             # check both are there
   ```

3. Open `http://localhost:5173` in Chrome on the phone, and pair with `localhost:8765`.

The forwards are lost whenever the phone is unplugged or the adb server restarts: if the phone suddenly can't reach the app or the server, run step 2 again.

On WSL, use the Windows `adb.exe` (from the Android platform tools installed on Windows): the phone authorizes that one, and WSL's own adb shows up as unauthorized.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
