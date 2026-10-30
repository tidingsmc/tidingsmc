package dev.tidings.core;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

/** Picks the devices that want to hear about something, and sends them a push. */
final class Notifier {
    private static final Logger LOGGER = LoggerFactory.getLogger(Notifier.class);

    /** News older than this isn't worth showing: a phone offline for longer misses it. */
    static final Duration TTL = Duration.ofMinutes(10);

    private final Store store;
    private final PushSender sender;

    Notifier(Store store, PushSender sender) {
        this.store = store;
        this.sender = sender;
    }

    /**
     * @param player who joined or left; null for news about the server
     * @param online who's on the server now
     * @return completes once every push got an answer
     */
    CompletableFuture<Void> notify(
            NotificationKind kind, PlayerProfile player, Set<UUID> online, Instant now) {
        try {
            return send(kind, player, online, now);
        } catch (RuntimeException e) {
            // Called from the game's thread: a failed push mustn't break what the game does next.
            LOGGER.error("Couldn't send {} notifications", kind, e);
            return CompletableFuture.completedFuture(null);
        }
    }

    private CompletableFuture<Void> send(
            NotificationKind kind, PlayerProfile player, Set<UUID> online, Instant now) {
        byte[] payload = Json.pushMessage(kind, player).toString().getBytes(StandardCharsets.UTF_8);
        String topic = topic(player);
        UUID about = player == null ? null : player.id();
        List<CompletableFuture<Void>> sends = new ArrayList<>();
        for (Device device : store.devices()) {
            PushSubscription to = device.push();
            UUID owner = device.player().id();
            if (to == null
                    || !device.settings().wants(kind, about, now, owner, online.contains(owner))) {
                continue;
            }
            sends.add(
                    sender.send(to, payload, TTL, topic)
                            .thenAccept(
                                    result -> {
                                        if (result == PushSender.Result.GONE) forget(device, to);
                                    }));
        }
        return CompletableFuture.allOf(sends.toArray(CompletableFuture[]::new));
    }

    /**
     * Drops a subscription its push service no longer knows. The device stays paired: the app sends
     * its new subscription next time it's opened.
     */
    private void forget(Device device, PushSubscription gone) {
        try {
            store.updateDevice(device.id(), d -> gone.equals(d.push()) ? d.withPush(null) : d);
            LOGGER.info(
                    "Push subscription of {}'s device {} expired",
                    device.player().name(),
                    device.name());
        } catch (RuntimeException e) {
            // Caught whatever it is, so notify()'s future still completes normally.
            LOGGER.error("Couldn't forget an expired push subscription", e);
        }
    }

    /**
     * Like the app's notification tags: news about one player replaces the previous one still
     * waiting for the phone, and so does news about the server. At most 32 base64url characters.
     */
    private static String topic(PlayerProfile player) {
        if (player == null) return "server";
        try {
            byte[] hash =
                    MessageDigest.getInstance("SHA-256")
                            .digest(player.id().toString().getBytes(StandardCharsets.US_ASCII));
            return Base64Url.encode(hash).substring(0, 32);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("Every JVM has SHA-256", e);
        }
    }
}
