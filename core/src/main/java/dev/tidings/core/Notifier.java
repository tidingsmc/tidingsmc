package dev.tidings.core;

import com.google.gson.JsonObject;

import dev.tidings.core.addon.Notification;

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
import java.util.function.Predicate;
import java.util.function.Supplier;

final class Notifier {
    private static final Logger LOGGER = LoggerFactory.getLogger(Notifier.class);

    // News older than this isn't worth showing
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
        UUID about = player == null ? null : player.id();
        return send(
                kind.name(),
                () -> Json.pushMessage(kind, player),
                player == null ? "server" : topic(player.id().toString()),
                device -> {
                    UUID owner = device.player().id();
                    return device.settings().wants(kind, about, now, owner, online.contains(owner));
                });
    }

    /**
     * @param online who's on the server now
     * @return completes once every push got an answer
     */
    CompletableFuture<Void> notifyAddon(
            String addonId, Notification notification, Set<UUID> online, Instant now) {
        PlayerProfile player = notification.player();
        UUID about = player == null ? null : player.id();
        return send(
                addonId + " add-on",
                () -> Json.addonPushMessage(addonId, notification),
                topic("addon:" + addonId + ":" + (about == null ? "news" : about)),
                device -> {
                    UUID owner = device.player().id();
                    return notification.isFor(owner)
                            && device.settings()
                                    .wantsAddon(addonId, about, now, owner, online.contains(owner));
                });
    }

    private CompletableFuture<Void> send(
            String what, Supplier<JsonObject> message, String topic, Predicate<Device> wants) {
        try {
            byte[] payload = message.get().toString().getBytes(StandardCharsets.UTF_8);
            if (payload.length > WebPush.MAX_PAYLOAD) {
                LOGGER.warn(
                        "Dropped {} notification: {} bytes, over a push's {}",
                        what,
                        payload.length,
                        WebPush.MAX_PAYLOAD);
                return CompletableFuture.completedFuture(null);
            }
            List<CompletableFuture<Void>> sends = new ArrayList<>();
            for (Device device : store.devices()) {
                PushSubscription to = device.push();
                if (to == null || !wants.test(device)) continue;
                sends.add(
                        sender.send(to, payload, TTL, topic)
                                .thenAccept(
                                        result -> {
                                            if (result == PushSender.Result.GONE) {
                                                forget(device, to);
                                            }
                                        }));
            }
            return CompletableFuture.allOf(sends.toArray(CompletableFuture[]::new));
        } catch (RuntimeException e) {
            LOGGER.error("Couldn't send {} notifications", what, e);
            return CompletableFuture.completedFuture(null);
        }
    }

    private void forget(Device device, PushSubscription gone) {
        try {
            store.updateDevice(device.id(), d -> gone.equals(d.push()) ? d.withPush(null) : d);
            LOGGER.info(
                    "Push subscription of {}'s device {} expired",
                    device.player().name(),
                    device.name());
        } catch (RuntimeException e) {
            LOGGER.error("Couldn't forget an expired push subscription", e);
        }
    }

    private static String topic(String key) {
        try {
            byte[] hash =
                    MessageDigest.getInstance("SHA-256")
                            .digest(key.getBytes(StandardCharsets.UTF_8));
            return Base64Url.encode(hash).substring(0, 32);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("Every JVM has SHA-256", e);
        }
    }
}
