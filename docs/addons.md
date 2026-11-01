# Writing a Tidings add-on

An add-on is a tab that your mod adds to a server's page in the Tidings app. Players open it on their phone to see what your mod knows (their stats, a shop, a claim, a leaderboard) and to act on it (buy, vote, post) without joining the game.

You don't write any app code. Your mod describes each page as a list of **blocks**, such as headings, stats, lists, buttons and forms, and the app draws them in its own style. When the player taps a button or sends a form, the app calls one of your **actions** on the server.

- [How it works](#how-it-works)
- [Setting up your mod](#setting-up-your-mod)
- [Registering an add-on](#registering-an-add-on)
- [Views](#views)
- [Blocks](#blocks)
- [Forms and fields](#forms-and-fields)
- [Actions](#actions)
- [Links and params](#links-and-params)
- [Errors](#errors)
- [Security](#security)
- [Threading and timing](#threading-and-timing)
- [Limits](#limits)
- [Example](#example)

## How it works

```
 phone (Tidings app)                       Minecraft server (your mod)
 ───────────────────                       ───────────────────────────
 opens the "Bounties" tab   ── view ──▶    board(request)   → View [blocks…]
 taps a row                 ── view ──▶    bounty(request)  → View [blocks…]
 sends the "Post" form      ── action ─▶   post(request)    → ActionResult "Bounty posted"
 shows "Bounty posted", reloads the view
```

- **A view** is a page. It's a function that takes a `Request` and returns a `View`, which is an optional title plus blocks. The first view you register is the one the tab opens on.
- **An action** is something the player does. It's a function that takes a `Request` and returns an `ActionResult`: an optional message, and optionally a link to another view.
- **Tidings handles the rest.** It pairs devices, checks the player's token before your code runs, carries requests over the owner's HTTPS or the relay, and draws the pages. Your code never sees device tokens, and no add-on code runs on the phone.

## Setting up your mod

Tidings is optional for your mod: register the add-on only when Tidings is installed.

**`mods.toml`**: declare Tidings as an optional dependency on the server side:

```toml
[[dependencies.yourmod]]
    modId="tidings"
    mandatory=false
    versionRange="[0.1,)"
    ordering="NONE"
    side="SERVER"
```

**Your mod's class**: register from the constructor, behind a check, and pass along the context Forge gives the constructor. Tidings reads your mod's ID from it (see below). Keep every Tidings class reference in a separate class, here `BountiesAddon`, so that your mod still loads when Tidings is missing:

```java
@Mod("bounties")
public class BountiesMod {
    public BountiesMod(FMLJavaModLoadingContext context) {
        if (ModList.get().isLoaded("tidings")) BountiesAddon.register(context);
    }
}
```

**Compiling**: there is no published API artifact yet. Until there is, compile against the Tidings jar without bundling it:

```groovy
dependencies {
    compileOnly files("libs/tidings-forge-1.20.1-0.1.0.jar")
}
```

The add-on classes are plain Java in `dev.tidings.core.addon`, with no Minecraft types. Outside that package, you'll only use `dev.tidings.core.PlayerProfile` and the Forge entry point `dev.tidings.forge.TidingsAddons`.

## Registering an add-on

```java
TidingsAddons.register(
        context,                                       // from your mod's constructor
        Addon.builder("Bounties")
                .icon(Icon.SWORD)
                .view("board", BountiesAddon::board)    // the tab opens on the first view
                .view("bounty", BountiesAddon::bounty)
                .action("post", BountiesAddon::post)
                .action("cancel", BountiesAddon::cancel));
```

| | |
|---|---|
| **ID** | You don't choose it: it's your mod's ID, which Tidings reads from the context you pass. It appears in the app's URLs, so it stays the same across versions and no two mods can share one. As a result, **a mod can add one tab**. Use several views within it for different pages. |
| **title** | The tab's name. The tab itself only shows the icon, but the title appears at the top of your tab and screen readers read it out. |
| **icon** | One of the `Icon` values: `CHART`, `TROPHY`, `MAP`, `BOOK`, `STORE`, `COINS`, `GIFT`, `CALENDAR`, `FLAG`, `MAIL`, `MESSAGE`, `STAR`, `HEART`, `SWORD`, `SHIELD`, `CROWN`, `SERVER`, `GAMEPAD`, `LIGHTBULB`, `SLIDERS`. If you don't set one, or the app is older than the icon, the tab shows a generic icon. Add-ons can't send their own images. |
| **views, actions** | Names are 1 to 64 of `A-Z a-z 0-9 _ -`. An add-on needs at least one view. |

A tab appears in the app as soon as the server has at least one add-on. Tabs are ordered by mod ID, after the server's own tab.

## Views

```java
private static View board(Request request) {
    return View.of("Open bounties",                 // or null for no title
            Block.text("Hello " + request.player().name()),
            Block.button("Post one", Link.to("post")));
}
```

A view function gets a `Request`:

| | |
|---|---|
| `request.player()` | The `PlayerProfile` (`id()`, `name()`, `skinUrl()`) whose phone is asking. Tidings has already checked the token. |
| `request.param("id")` | A param from the link, button or form that led here. Throws an `AddonError` ("Missing id") if it's missing. |
| `request.param("sort", "name")` | The same, with a fallback. |
| `request.locale()` | The app's language, such as `"en"` or `"fr"`. Use it to translate your text and format numbers. |

Views are fetched again whenever the player opens them or an action finishes. Build them from the current state each time and don't cache them per player.

## Blocks

Text is always shown as plain text: no HTML, Markdown or Minecraft formatting codes.

| Block | Java | Looks like |
|---|---|---|
| Heading | `Block.heading("Your stats")` | A small section title |
| Text | `Block.text("…")`, `Block.muted("…")` | A paragraph. Use the muted one for hints and footnotes. |
| Stats | `Block.stats(Block.Stat.of("Deaths", "12"), …)` | Tiles side by side. The value is shown as is, so format it yourself, for example `"2.4 h"`. |
| List | `Block.list(items).empty("Nobody yet")` | Rows. `empty` is shown when there are no items. |
| List row | `Block.ListItem.of("Steve").subtitle("Builder").trailing("3").player(profile).link(Link.to(…))` | A title with an optional subtitle, a value at the end, the player's face at the start, and a link that opens when the row is tapped |
| Progress | `Block.progress("Advancements", 12, 80)` | A filled bar. It needs `0 ≤ value ≤ max` and `max > 0`. |
| Choices | `Block.choices(List.of(Block.Choice.of("Kills", Link.to("top", Map.of("by", "kills")), true), …))` | A row of options, one of them selected. Each opens a view, which is useful for sort orders and filters. |
| Button (action) | `Block.button("Make it day", "day")` | Runs an action. Add `.params(Map.of(…))`, `.style(Block.Button.Style.PRIMARY or DANGER)` or `.confirm("Are you sure?")` as needed. |
| Button (link) | `Block.button("Leaderboard", Link.to("top"))` | Opens a view |
| Form | `Block.form("post", "Post", fields…)` | See [Forms and fields](#forms-and-fields) |
| Card | `Block.card(blocks…)` | Draws a frame around the blocks it contains. A card can't contain another card. |

If an add-on is built for a newer Tidings with block types this app doesn't know, the app shows "update Tidings" in place of those blocks (see `View.VERSION`).

## Forms and fields

```java
Block.form("post", "Post",                                        // action, submit button label
        Field.text("target", "Player").placeholder("Steve").maxLength(16),
        Field.text("reward", "Reward").value("1 diamond"),          // pre-filled
        Field.toggle("anonymous", "Post anonymously", false),
        Field.select("duration", "Lasts", List.of(
                Field.Option.of("1d", "One day"),
                Field.Option.of("7d", "One week")), "1d"))
    .params(Map.of("board", "main"))                               // sent along, like a button's
```

When the form is sent, its action receives every field by name in `request.value(name)`, always as a string:

| Field | Value received |
|---|---|
| text | What the player typed. The app limits it to `maxLength`, which is at most 1000 and 1000 by default. |
| toggle | `"true"` or `"false"` |
| select | The chosen option's `value` |

Field names follow the same rule as view names, and must be unique within a form.

## Actions

```java
private static ActionResult post(Request request) {
    // … change something …
    return ActionResult.message("Bounty posted");
}
```

An action gets the same `Request` as a view, plus `request.value(name)` for form fields. It returns one of:

| | What the app does next |
|---|---|
| `ActionResult.done()` | Reloads the current view |
| `ActionResult.message("Saved")` | Shows the message, then reloads the current view |
| `ActionResult.open(Link.to("board"))` | Opens that view |
| `ActionResult.message("Cancelled").then(Link.to("board"))` | Shows the message, then opens that view |

Because the view is reloaded after every action, the page always shows the new state. You don't need to return the changed data yourself.

## Links and params

A `Link` opens one of **your own** views. Add-ons can't link anywhere else: not to other add-ons, other screens of the app, or websites.

```java
Link.to("bounty", Map.of("id", bounty.id().toString()))
```

Params end up in the app's URL. They're for small things like IDs, a page number or a sort order. Each value is a string of up to 256 characters, with at most 16 params. Put anything bigger in your mod's own storage and pass its ID.

## Errors

| You throw | The player sees | Logged on the server |
|---|---|---|
| `new AddonError("You're not in this colony")` | That message, as is | No |
| Anything else | A generic error | Yes, with the stack trace |

Use `AddonError` for anything the player should understand: missing permission, an item that's gone, invalid input. Write its message for players, in `request.locale()` if you translate. A view or action that returns `null` counts as a bug, so the player gets the generic error.

If the player opens a view or action that no longer exists, for example after a mod update, Tidings answers on its own with "This page doesn't exist anymore".

## Security

Your views and actions can be reached by any paired player, with any params, at any time. The app is the only intended client, but a modified client can send anything.

- **Decide who may do what.** `request.player()` is always the real player, because Tidings checks the token. Whether that player may see or change the thing named in the request is up to you. For example, only a bounty's author should be able to cancel it.
- **Check every param and value on the server.** `maxLength`, select options and hidden buttons only shape the app's interface; they don't limit what a client can send. Check lengths, number formats and that IDs exist. The server only enforces the hard limits listed under [Limits](#limits).
- **Don't trust a param because you wrote it.** A link to `bounty?id=…` can be edited by hand to any ID.
- **Be careful with text other players wrote.** Text in blocks is always shown as plain text, but if you broadcast it in game chat, the usual chat rules apply, such as length and formatting codes.
- **Tokens stay private.** Add-ons never see device tokens or other players' devices.

## Threading and timing

Views and actions run **on the server thread**, one at a time like everything else in the game. That means:

- You can read and change the world, players and saved data directly, with no locking.
- Every millisecond you spend is a millisecond of server lag. Keep them quick: no network calls, no reading hundreds of files. Precompute or cache expensive data, such as a leaderboard, elsewhere.
- The app gives up after **5 seconds** and shows an error. A slow action may still finish afterwards, so make actions safe to run twice where it matters, for example by ignoring a second "buy" with the same order ID.
- Add-ons are also called while the server is starting or stopping. If you need the `MinecraftServer`, check that it exists and throw an `AddonError` if it doesn't:

```java
MinecraftServer server = ServerLifecycleHooks.getCurrentServer();
if (server == null) throw new AddonError("The server is starting or stopping");
```

## Limits

| | |
|---|---|
| Add-ons per mod | One, with your mod's ID |
| View, action, param and field names | 1 to 64 of `A-Z a-z 0-9 _ -` |
| Params | At most 16, each value up to 256 characters |
| Text field values | Up to 1000 characters |
| Request body | 64 KiB |
| Time per view or action | 5 seconds, then the app shows an error |

## Example

For a complete add-on example, see [tidingsmc-vanilla](https://github.com/tidingsmc/tidingsmc-vanilla).

## For app developers

The JSON the app receives (`/api/info`'s `addons`, and `POST /api/addons/<id>/view` and `/action`) is described in `app/src/lib/addons.ts`, which mirrors the Java classes in `core/src/main/java/dev/tidings/core/addon/`.
