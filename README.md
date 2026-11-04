# Tidings

Get a notification on your phone when your friends join your Minecraft server.

Tidings is a server-side Forge mod and a web app (PWA). You pair your phone with a server once, and from then on you get notified when people join and can see who's online. One app works for all the servers you've paired with. There's no central Tidings service: each server sends its own push notifications.

Tidings is designed to be easy and free to set up, with no domain to buy. The default setup uses a free Cloudflare relay, and the free plan easily covers small servers. For bigger servers, serving the API directly may be the better choice (see [Installation](#installation)).

## Installation

Tidings runs on a Minecraft 1.20.1 server with Forge 47 or later. It is server-side only.

Download `tidings-forge-1.20.1-<version>.jar` from the [latest release](https://github.com/tidingsmc/tidingsmc/releases/latest), put it in the server's `mods/` folder and restart the server. This creates `config/tidings-common.toml`, and the mod keeps its data in `tidings/data.json`. Back that file up, since losing it unpairs every device.

The app needs a way to reach the server over HTTPS. There are two options:

- **Relay (easiest):** Deploy your own relay to Cloudflare. It's free and doesn't need a domain. The mod connects out to it, so this works on rented hosting too. You need Node 22+:

```sh
cd relay
pnpm install
pnpm exec wrangler login --scopes account:read user:read workers:write workers_scripts:write
pnpm run deploy
```

If your Cloudflare account doesn't have a workers.dev subdomain yet, the first deploy asks you to pick one. It's shared by all the Workers on your account and can't be taken by anyone else, and it shows up in the relay's address, so pick something you're fine with players seeing. The relay ends up at `https://tidings-relay.<subdomain>.workers.dev`, and the deploy prints it at the end.

In `config/tidings-common.toml` (in the server folder), set `relay-url` to the relay's address (the URL printed by the deploy) and restart the server. The mod logs a key: set it as the relay's `OWNER_KEY` secret, either in the Cloudflare dashboard (your worker → Settings → Variables, and mark it a secret) or with `pnpm exec wrangler secret put OWNER_KEY` from `relay/`. The mod connects within a minute. If you lose `data.json`, the key changes and you'll have to set it again.

- **Direct:** The API listens on `127.0.0.1:8765` (`port`, `bind-address`). Expose it over HTTPS yourself (Cloudflare Tunnel, Tailscale Funnel, Caddy...) and set `public-url`.

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
