package dev.tidings.forge;

import net.minecraftforge.common.ForgeConfigSpec;

final class TidingsConfig {
    static final ForgeConfigSpec SPEC;
    static final ForgeConfigSpec.IntValue PORT;
    static final ForgeConfigSpec.ConfigValue<String> BIND_ADDRESS;
    static final ForgeConfigSpec.ConfigValue<String> PUBLIC_URL;
    static final ForgeConfigSpec.ConfigValue<String> APP_URL;
    static final ForgeConfigSpec.ConfigValue<String> SERVER_NAME;
    static final ForgeConfigSpec.ConfigValue<String> CLIENT_IP_HEADER;
    static final ForgeConfigSpec.ConfigValue<String> RELAY_URL;

    static {
        ForgeConfigSpec.Builder builder = new ForgeConfigSpec.Builder();
        RELAY_URL =
                builder.comment(
                                "Address of your Tidings relay, e.g."
                                        + " https://tidings-relay.you.workers.dev (see the README"
                                        + " to deploy one for free). The mod connects out to it, so"
                                        + " the server needs no public address.",
                                "When set, port, bind-address, public-url and client-ip-header"
                                        + " are unused. Empty: serve the API directly instead.")
                        .define("relay-url", "");
        PORT =
                builder.comment("Port of the HTTP API the Tidings app calls.")
                        .defineInRange("port", 8765, 1, 65535);
        BIND_ADDRESS =
                builder.comment(
                                "Address the HTTP API listens on. The API is plain HTTP: put HTTPS"
                                        + " in front of it (Cloudflare Tunnel, Tailscale Funnel,"
                                        + " Caddy...).",
                                "Use 0.0.0.0 if that runs on another machine or in a container.")
                        .define("bind-address", "127.0.0.1");
        PUBLIC_URL =
                builder.comment(
                                "The HTTPS address players' phones reach the API at, e.g."
                                        + " https://mc.example.com. Empty: http://localhost:<port>,"
                                        + " which only works for testing.")
                        .define("public-url", "");
        APP_URL =
                builder.comment("Where the Tidings app is hosted. Pairing links open it.")
                        .define("app-url", "http://localhost:5173/");
        SERVER_NAME =
                builder.comment(
                                "Name the app suggests when a player pairs. Empty: players"
                                        + " name the server themselves.")
                        .define("server-name", "");
        CLIENT_IP_HEADER =
                builder.comment(
                                "Header the HTTPS proxy on this machine puts the player's address"
                                        + " in, to limit wrong pairing codes per player:"
                                        + " X-Forwarded-For (Caddy, nginx, Tailscale, Cloudflare"
                                        + " Tunnel) or CF-Connecting-IP (Cloudflare Tunnel).",
                                "Leave empty for a plain TCP tunnel (ssh -R, adb reverse...): then"
                                        + " anyone could fake that header.")
                        .define("client-ip-header", "");
        SPEC = builder.build();
    }

    private TidingsConfig() {}

    /** Empty without a relay. */
    static String relayUrl() {
        return RELAY_URL.get().strip().replaceAll("/+$", "");
    }

    static String publicUrl() {
        if (!relayUrl().isEmpty()) return relayUrl();
        String url = PUBLIC_URL.get().strip().replaceAll("/+$", "");
        return url.isEmpty() ? "http://localhost:" + PORT.get() : url;
    }

    static String vapidSubject() {
        String url = publicUrl();
        return url.startsWith("https://") ? url : "https://github.com/tidingsmc/tidingsmc";
    }
}
