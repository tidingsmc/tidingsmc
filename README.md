# Tidings

Get a notification on your phone when your friends join your Minecraft server.

Tidings is a server-side Forge mod and a web app (PWA). You pair your phone with a server once, and from then on you get notified when people join and can see who's online. One app works for all the servers you've paired with. There's no central Tidings service: each server sends its own push notifications.

## Setting up a server

Put the mod jar in `mods/` and start the server once. This creates `config/tidings-common.toml`, and the mod keeps its data in `tidings/data.json`. Back that file up, since losing it unpairs every device.

Phones need a way to reach the server over HTTPS. There are two options:

- **Relay (easiest).** Deploy your own relay to Cloudflare. It's free and doesn't need a domain. The mod connects out to it, so this works on rented hosting too. You need Node 22+:

```sh
cd relay
pnpm install
npx wrangler login
pnpm run deploy
```

Set `relay-url` to the relay's address (like `https://tidings-relay.<you>.workers.dev`) and restart the server. The mod logs a key: set it as the relay's `OWNER_KEY` secret, either in the Cloudflare dashboard (your worker → Settings → Variables and Secrets, type Secret) or with `npx wrangler secret put OWNER_KEY` from `relay/`. The mod connects within a minute. If you lose `data.json`, the key changes and you'll have to set it again.

- **Direct.** The API listens on `127.0.0.1:8765` (`port`, `bind-address`). Expose it over HTTPS yourself (Cloudflare Tunnel, Tailscale Funnel, Caddy...) and set `public-url`.

In both cases, set `app-url` to where the app is hosted, because the pairing QR codes open it. Tidings stays off until it's set. The server also needs outgoing HTTPS to reach the relay and the push services (Google, Mozilla, Apple).

## Commands

- `/tidings pair`: get a QR code. `/tidings pair code` gives an address and a 6-digit code to type instead.
- `/tidings devices`: list and  unpair your devices.
- `/tidings hide` / `show`: stop or resume telling other players' phones when you join or leave, and whether you show as online.
- `/tidings help`

Admins (permission level 3 or the console) also have `/tidings admin status`, `doctor` (checks that phones can reach the server and push works), `devices [player]` and `unpair <device>`.

Set `announce-players = false` to keep players hidden until they pair a phone or run `/tidings show`.

## Add-ons

Other mods can add their own tabs to a server's page in the app, and send notifications. They describe pages as blocks (text, stats, lists, buttons, forms...) and the app renders them, so no add-on code runs on the phone. See [docs/addons.md](docs/addons.md), and [tidingsmc-vanilla-stats](https://github.com/tidingsmc/tidingsmc-vanilla-stats) for an example.

## Development

You need JDK 17+, Node 22+ and pnpm (`corepack enable pnpm` picks up the version pinned in `package.json`).

```sh
./gradlew :core:test          # core tests
./gradlew :forge:build        # jar in forge/build/libs/
./gradlew :forge:runServer    # dev server with the mod

cd app && pnpm install && pnpm run dev
cd app && pnpm test
cd relay && pnpm install && pnpm test
```

For the dev server, accept the EULA in `forge/run/eula.txt` and set `app-url = "http://localhost:5173/"` in `forge/run/config/tidings-common.toml`. Then pair the app with `localhost:8765`.

The API is documented in `app/src/lib/api.ts`.

### Testing on an Android phone

The app needs a secure context for the camera, service worker and push. With USB debugging on, `adb reverse` lets the phone use `localhost`:

```sh
adb reverse tcp:5173 tcp:5173  # app
adb reverse tcp:8765 tcp:8765  # Tidings API
```

Open `http://localhost:5173` in Chrome on the phone and pair with `localhost:8765`. 

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
