package dev.tidings.forge;

import java.net.URI;
import java.net.URISyntaxException;

import net.minecraftforge.common.ForgeConfigSpec;

final class TidingsConfig {
    static final ForgeConfigSpec SPEC;
    static final ForgeConfigSpec.ConfigValue<Integer> PORT;
    static final ForgeConfigSpec.ConfigValue<String> BIND_ADDRESS;
    static final ForgeConfigSpec.ConfigValue<String> PUBLIC_URL;
    static final ForgeConfigSpec.ConfigValue<String> APP_URL;
    static final ForgeConfigSpec.ConfigValue<String> SERVER_NAME;
    static final ForgeConfigSpec.ConfigValue<String> CLIENT_IP_HEADER;
    static final ForgeConfigSpec.ConfigValue<String> RELAY_URL;
    static final ForgeConfigSpec.BooleanValue ANNOUNCE_PLAYERS;

    static {
        ForgeConfigSpec.Builder builder = new ForgeConfigSpec.Builder();
        RELAY_URL =
                builder.comment(
                                " WITH A RELAY",
                                " The relay's address. Empty to serve the API directly")
                        .define("relay-url", "");
        PORT =
                builder.comment("", " WITHOUT A RELAY")
                        .define(
                                "port",
                                8765,
                                value -> value instanceof Integer port && port >= 1 && port <= 65535);
        BIND_ADDRESS = builder.define("bind-address", "127.0.0.1");
        PUBLIC_URL = builder.define("public-url", "");
        CLIENT_IP_HEADER =
                builder.comment(
                                " Header your HTTPS proxy puts the player's IP in (X-Forwarded-For,"
                                        + " CF-Connecting-IP)",
                                " Leave empty for a plain TCP tunnel, where it can be faked")
                        .define("client-ip-header", "");
        APP_URL =
                builder.comment("", " Where the app is hosted (required)")
                        .define("app-url", "");
        SERVER_NAME =
                builder.comment("", " Server name suggested when pairing")
                        .define("server-name", "");
        ANNOUNCE_PLAYERS =
                builder.comment(
                                "",
                                " Set to false to hide players by default, until they pair a phone"
                                        + " or use /tidings show")
                        .define("announce-players", true);
        SPEC = builder.build();
    }

    private TidingsConfig() {}

    /** What's wrong with the settings, or null if Tidings can start with them */
    static String problem() {
        if (appUrl().isEmpty()) return "app-url isn't set";
        if (!isWebAddress(appUrl())) return "app-url " + appUrl() + " isn't a web address";
        if (!relayUrl().isEmpty() && !isWebAddress(relayUrl())) {
            return "relay-url " + relayUrl() + " isn't a web address (it starts with https://)";
        }
        String publicUrl = PUBLIC_URL.get().strip();
        if (!publicUrl.isEmpty() && !isWebAddress(publicUrl)) {
            return "public-url " + publicUrl + " isn't a web address (it starts with https://)";
        }
        return null;
    }

    private static boolean isWebAddress(String url) {
        try {
            URI uri = new URI(url);
            return ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
                    && uri.getHost() != null;
        } catch (URISyntaxException e) {
            return false;
        }
    }

    /** Without its fragment: pairing links put theirs */
    static String appUrl() {
        return APP_URL.get().strip().replaceAll("#.*$", "");
    }

    /** The app's address without "https://", for players to type on their phone */
    static String appAddress() {
        return appUrl().replaceFirst("^https://", "").replaceAll("/+$", "");
    }

    /** Empty without a relay */
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
