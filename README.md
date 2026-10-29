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
- **Pairing**: on first join (or `/tidings pair`), the player gets a map showing a QR code that opens the PWA with a single-use, short-lived pairing code. A 6-digit code is the fallback.
- **Notifications**: the mod sends Web Push directly with its own key. The PWA keeps one service worker registration per paired server (scope `/s/<serverId>/`), so one app can receive pushes from many servers.
- **Security**: every API call except pairing requires a per-device token (stored hashed on the server). Pairing codes expire, are single-use and rate-limited.

Not supported yet: rented hosting without a way to add HTTPS, and Aternos.

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

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
