# Writing a Tidings add-on

An add-on is a tab that your mod adds to a server's page in the Tidings app, so players can see what your mod knows and act on it from their phone. You don't write app code: your mod returns pages made of blocks, and the app draws them.

**To learn, read [Tidings Vanilla Stats](https://github.com/tidingsmc/tidingsmc-vanilla-stats)**, a complete add-on with stats, leaderboards, advancement trees and notifications.

## Setup

Make Tidings an optional dependency and register only when it's loaded, so your mod still works without it. See Vanilla's `mods.toml`, `build.gradle` and `VanillaMod`.

## Registering

Call `TidingsAddons.register` from your mod's constructor with a title, an icon, views and actions. Your mod's ID is the add-on's ID, so a mod adds one tab. Keep the returned `AddonContext` for notifications and privacy checks. See `VanillaAddon.register`.

## Views and blocks

A view is a page: a function from `Request` to a `View` of blocks such as text, stats, lists, progress bars, choices, buttons, chats, cards and trees. `request.player()` is the checked player. Views are rebuilt on every open, so read the current state.

To keep a page live return it with `view.refreshEvery(Duration.ofSeconds(5))`. The app reloads it at that rate while it's open and in front, from 2 seconds to 1 hour. Each reload is a request, which counts against the free Cloudflare quota when there's a relay, so pick the slowest rate that still feels live.

## Icons and images

Icons are [pixelarticons](https://pixelarticons.com), picked by name with `Icon.named("sword")`, or small images of your own such as item textures with `Icon.image(bytes)`. The tab, list rows and tree nodes take one, and `Block.icon` puts one in the page. `Block.image` adds a bigger image, from its bytes or base64.

## Forms and actions

Buttons and forms call actions, which change something and return an `ActionResult` (a message, or a view to open). Form fields arrive as strings in `request.value(name)`.

A `Block.chat` shows lines like the game's chat, with a box to write in that calls its action with the text in `request.value(Block.Chat.VALUE)`. See [Tidings Vanilla Chat](https://github.com/tidingsmc/tidingsmc-vanilla-chat).

## Notifications

`AddonContext.notify(Notification.of(text).about(player).link(link))` sends a push, from any thread. Players can turn each add-on's notifications off, and Tidings drops more than 10 a minute. See `VanillaAddon.onDeath`.

## Privacy

Leave players who ran `/tidings hide` out of anything other players see, with `AddonContext.isHidden(uuid)`. See Vanilla's leaderboard.

## Errors and security

Throw `AddonError` to show the player a message. Any paired player can call any view or action with any params, so check permissions and every value on the server.

## Threading

Views and actions run on the server thread and must be quick, so cache expensive data.

## Community add-ons

There are two ways to share your addon:

- **Host it in the [tidingsmc](https://github.com/tidingsmc) organization.** [Open an issue](https://github.com/tidingsmc/tidingsmc/issues/new) asking to join, and you can create your add-on's repository there. This gives it a shared home where others can help maintain it.
- **Keep it in your own repository.** Add the `tidings-addon` topic to it so people can find it alongside the others.

Browse existing add-ons under the [`tidings-addon` topic](https://github.com/topics/tidings-addon) or in the [organization](https://github.com/tidingsmc).
