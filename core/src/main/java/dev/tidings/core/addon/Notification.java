package dev.tidings.core.addon;

import dev.tidings.core.PlayerProfile;

import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * A push notification an add-on sends to players' phones, through {@link AddonContext#notify}:
 *
 * <pre>{@code
 * context.notify(Notification.of("Steve fell from a high place")
 *         .about(steve)                              // shows Steve's face; not sent to Steve
 *         .link(Link.to("player", Map.of("id", id)))); // opened when it's tapped
 * }</pre>
 *
 * The app titles it with the server's name. Each player chooses in the app whether they want an
 * add-on's notifications, and quiet hours apply as to every notification.
 *
 * @param text the notification's body, as plain text: 1 to {@link #MAX_TEXT_LENGTH} characters
 * @param player who it's about, if anyone: their face is shown, their own devices aren't told, and
 *     nobody is if they chose to be hidden from phones. A newer notification about the same player
 *     from the same add-on replaces the previous one still showing
 * @param link the add-on's view to open when it's tapped; null opens the add-on's first view
 * @param recipients the players whose devices may get it; null for every paired device
 */
public record Notification(String text, PlayerProfile player, Link link, Set<UUID> recipients) {
    public static final int MAX_TEXT_LENGTH = 200;

    /**
     * In bytes, as the link is sent: UTF-8 JSON. Push payloads are limited to about 4 KB, so links
     * are kept far shorter than a view's can be
     */
    public static final int MAX_LINK_BYTES = 1024;

    public Notification {
        Objects.requireNonNull(text, "text");
        if (text.isBlank()) throw new IllegalArgumentException("A notification needs text");
        if (text.length() > MAX_TEXT_LENGTH) {
            throw new IllegalArgumentException(
                    "A notification's text is at most " + MAX_TEXT_LENGTH + " characters");
        }
        if (link != null && bytes(link) > MAX_LINK_BYTES) {
            throw new IllegalArgumentException(
                    "A notification's link, its view and params together, is at most "
                            + MAX_LINK_BYTES
                            + " bytes as UTF-8 JSON");
        }
        if (recipients != null) recipients = Set.copyOf(recipients);
    }

    public static Notification of(String text) {
        return new Notification(text, null, null, null);
    }

    public Notification about(PlayerProfile player) {
        return new Notification(text, Objects.requireNonNull(player, "player"), link, recipients);
    }

    public Notification link(Link link) {
        return new Notification(text, player, Objects.requireNonNull(link, "link"), recipients);
    }

    public Notification to(Collection<UUID> players) {
        return new Notification(text, player, link, Set.copyOf(players));
    }

    public boolean isFor(UUID player) {
        return recipients == null || recipients.contains(player);
    }

    /**
     * Its text, at most {@link #MAX_TEXT_LENGTH} UTF-16 characters, is at most 6 bytes each once
     * escaped: with the link and the rest of the push, it stays under its 4 KB
     */
    private static int bytes(Link link) {
        return link.toJson().toString().getBytes(StandardCharsets.UTF_8).length;
    }
}
