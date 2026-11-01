package dev.tidings.core;

import dev.tidings.core.addon.Addons;
import dev.tidings.core.addon.Notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

/** Entry point that platform adapters (Forge, later others) talk to */
public final class Tidings {
    private static final Logger LOGGER = LoggerFactory.getLogger(Tidings.class);

    /** Beyond this, players unpair a device themselves before pairing a new one. */
    public static final int MAX_DEVICES_PER_PLAYER = 5;

    /** How long a player has to approve a device in game, once it sent the right code. */
    public static final Duration APPROVAL_TIME = Duration.ofMinutes(5);

    private final Store store;
    private final Game game;
    private final Addons addons;
    private final Pairing pairing = new Pairing();
    private final Notifier notifier;
    private final Map<UUID, PlayerProfile> online = new LinkedHashMap<>();
    private final boolean announcedByDefault;

    /** Once set, players leaving aren't announced: the server going down says it. */
    private volatile boolean stopping;

    private final Map<String, AwaitingApproval> awaitingApproval = new HashMap<>();

    private volatile Consumer<Device> approvalListener = device -> {};

    /** When each add-on last notified, by ID, within the last minute. */
    private final Map<String, Deque<Instant>> addonNotifications = new HashMap<>();

    private final Addons.Host addonHost =
            new Addons.Host() {
                @Override
                public void notify(String addonId, Notification notification) {
                    addonNotified(addonId, notification, Instant.now());
                }

                @Override
                public boolean isAnnounced(UUID player) {
                    return Tidings.this.isAnnounced(player);
                }

                @Override
                public Optional<PlayerProfile> knownPlayer(UUID player) {
                    return store.knownPlayer(player);
                }
            };

    /**
     * {@code asked}: whether its player was asked to approve it yet. {@code outcome}: null while it
     * waits; a refused request is kept until it expires, so the app can tell why.
     */
    private record AwaitingApproval(
            Device device, Instant expiresAt, boolean asked, ApprovalStatus outcome) {
        boolean waiting() {
            return outcome == null;
        }
    }

    public enum ApprovalStatus {
        PENDING,
        APPROVED,
        DENIED,
        PLAYER_OFFLINE,
        /** Includes expired requests. */
        UNKNOWN
    }

    public sealed interface Approval {
        record Approved(Device device) implements Approval {}

        record NotFound() implements Approval {}

        record TooManyDevices() implements Approval {}
    }

    /**
     * @param push delivers the notifications, such as a {@link WebPush}
     * @param announcedByDefault whether phones hear about players who never used {@link
     *     #setAnnounced}
     */
    public Tidings(Store store, Game game, PushSender push, boolean announcedByDefault) {
        this(store, game, push, announcedByDefault, Addons.registered());
    }

    Tidings(Store store, Game game, PushSender push, boolean announcedByDefault, Addons addons) {
        this.store = store;
        this.game = game;
        this.addons = addons;
        this.notifier = new Notifier(store, push);
        this.announcedByDefault = announcedByDefault;
    }

    /** Once the server stopped. */
    public void close() {
        addons.disconnect(addonHost);
    }

    /** Announces players by default, without the add-ons other mods registered. */
    Tidings(Store store, Game game, PushSender push) {
        this(store, game, push, true, new Addons());
    }

    /** Sends no notifications, for tests. */
    Tidings(Store store, Game game) {
        this(
                store,
                game,
                (to, payload, ttl, topic) ->
                        CompletableFuture.completedFuture(PushSender.Result.DELIVERED));
    }

    public Store store() {
        return store;
    }

    public Game game() {
        return game;
    }

    public Addons addons() {
        return addons;
    }

    Pairing pairing() {
        return pairing;
    }

    /**
     * Then {@link #rememberPlayer}, which saves to disk: it can be called off the game's thread.
     */
    public void playerJoined(PlayerProfile player, Instant now) {
        synchronized (this) {
            online.put(player.id(), player);
        }
        if (!isAnnounced(player.id())) return;
        notifier.notify(NotificationKind.PLAYER_JOINED, player, onlineIds(), now);
    }

    /**
     * Records a player who joined, or their new name or skin.
     *
     * @return whether it's the player's first time here since Tidings was installed
     * @throws java.io.UncheckedIOException if it couldn't be saved
     */
    public boolean rememberPlayer(PlayerProfile player) {
        return store.rememberPlayer(player);
    }

    public void playerLeft(UUID id, Instant now) {
        PlayerProfile player;
        synchronized (this) {
            player = online.remove(id);
        }
        if (player == null || stopping || !isAnnounced(id)) return;
        notifier.notify(NotificationKind.PLAYER_LEFT, player, onlineIds(), now);
    }

    /** Add-ons can notify and see players from now on, until {@link #serverStopping}. */
    public void serverStarted(Instant now) {
        addons.connect(addonHost);
        notifier.notify(NotificationKind.SERVER_STARTED, null, onlineIds(), now);
    }

    /**
     * Players disconnected from now on aren't announced leaving: the server going down says it.
     *
     * @return completes once every push got an answer, worth waiting for before the JVM exits
     */
    public CompletableFuture<Void> serverStopping(Instant now) {
        stopping = true;
        addons.disconnect(addonHost);
        return notifier.notify(NotificationKind.SERVER_STOPPING, null, onlineIds(), now);
    }

    /**
     * Sends an add-on's notification, unless it's about a hidden player, the server is stopping, or
     * the add-on already sent {@link Addons#MAX_NOTIFICATIONS_PER_MINUTE} in the last minute.
     *
     * @return completes once every push got an answer
     */
    CompletableFuture<Void> addonNotified(String addonId, Notification notification, Instant now) {
        PlayerProfile player = notification.player();
        if (stopping || (player != null && !isAnnounced(player.id()))) {
            return CompletableFuture.completedFuture(null);
        }
        if (!withinAddonLimit(addonId, now)) {
            LOGGER.warn(
                    "The {} add-on sends over {} notifications a minute: dropped \"{}\"",
                    addonId,
                    Addons.MAX_NOTIFICATIONS_PER_MINUTE,
                    notification.text());
            return CompletableFuture.completedFuture(null);
        }
        return notifier.notifyAddon(addonId, notification, onlineIds(), now);
    }

    private synchronized boolean withinAddonLimit(String addonId, Instant now) {
        Deque<Instant> sent = addonNotifications.computeIfAbsent(addonId, id -> new ArrayDeque<>());
        Instant minuteAgo = now.minus(Duration.ofMinutes(1));
        while (!sent.isEmpty() && !sent.peekFirst().isAfter(minuteAgo)) sent.removeFirst();
        if (sent.size() >= Addons.MAX_NOTIFICATIONS_PER_MINUTE) return false;
        sent.addLast(now);
        return true;
    }

    private synchronized Set<UUID> onlineIds() {
        return Set.copyOf(online.keySet());
    }

    /** Everyone online, announced or not. */
    public synchronized List<PlayerProfile> onlinePlayers() {
        return List.copyOf(online.values());
    }

    /**
     * Whether phones are told when {@code player} joins or leaves, and see them online and among
     * the server's players.
     */
    public boolean isAnnounced(UUID player) {
        Boolean choice = store.announcedChoice(player);
        return choice == null ? announcedByDefault : choice;
    }

    /**
     * Takes effect at once, without telling phones: a player hiding while online doesn't look like
     * they left.
     *
     * @throws java.io.UncheckedIOException if it couldn't be saved
     */
    public void setAnnounced(UUID player, boolean announce) {
        store.setAnnounced(player, announce);
    }

    /**
     * When players aren't announced by default, announces {@code player} if they never chose:
     * pairing a phone says they're in.
     *
     * @return whether they're announced because of this
     * @throws java.io.UncheckedIOException if it couldn't be saved
     */
    public boolean announceIfUndecided(UUID player) {
        if (announcedByDefault || store.announcedChoice(player) != null) return false;
        store.setAnnounced(player, true);
        return true;
    }

    /**
     * A pairing code for {@code player}, valid for {@link Pairing#CODE_LIFETIME}. Their previous
     * code stops working.
     *
     * @return empty if the player already has {@link #MAX_DEVICES_PER_PLAYER} devices
     */
    public Optional<Pairing.Issued> startPairing(PlayerProfile player, Instant now) {
        if (store.hasMaxDevices(player.id(), MAX_DEVICES_PER_PLAYER)) return Optional.empty();
        return Optional.of(pairing.issue(player, now));
    }

    /** The pairing code {@code player} was given last, if it's still valid. */
    public Optional<String> pairingCodeOf(UUID player, Instant now) {
        return pairing.codeOf(player, now);
    }

    /**
     * Called on an HTTP thread when a device that sent the right code asks to be approved, once its
     * player named the server in the app: they approve it with {@link #approve} or refuse it with
     * {@link #deny}.
     */
    public void onApprovalNeeded(Consumer<Device> listener) {
        approvalListener = listener;
    }

    synchronized void awaitApproval(Device device, Instant now) {
        forgetExpired(now);
        awaitingApproval.put(
                device.id(), new AwaitingApproval(device, now.plus(APPROVAL_TIME), false, null));
    }

    /**
     * Asks the player of the device with {@code token} to approve it, once only. They then have
     * {@link #APPROVAL_TIME} to.
     *
     * @return false if no device with this token awaits approval
     */
    boolean askApproval(String token, Instant now) {
        AwaitingApproval awaiting;
        synchronized (this) {
            awaiting = findAwaiting(token, now);
            if (awaiting == null || !awaiting.waiting()) return false;
            if (!awaiting.asked) {
                awaitingApproval.put(
                        awaiting.device.id(),
                        new AwaitingApproval(awaiting.device, now.plus(APPROVAL_TIME), true, null));
            }
        }
        if (!awaiting.asked) approvalListener.accept(awaiting.device);
        return true;
    }

    public synchronized ApprovalStatus approvalStatus(String token, Instant now) {
        AwaitingApproval awaiting = findAwaiting(token, now);
        if (awaiting != null) return awaiting.waiting() ? ApprovalStatus.PENDING : awaiting.outcome;
        // Under the same lock as approve(): a device is either still waiting or already saved.
        if (store.deviceByToken(token).isPresent()) return ApprovalStatus.APPROVED;
        return ApprovalStatus.UNKNOWN;
    }

    /**
     * Forgets the device with {@code token} if it's waiting for approval: the app gave up on it.
     *
     * @return whether it was
     */
    public synchronized boolean withdraw(String token, Instant now) {
        AwaitingApproval awaiting = findAwaiting(token, now);
        if (awaiting == null || !awaiting.waiting()) return false;
        awaitingApproval.remove(awaiting.device.id());
        return true;
    }

    /**
     * Pairs one of {@code player}'s devices waiting for approval. If it can't be saved, it keeps
     * waiting: the player can approve it again.
     *
     * @throws java.io.UncheckedIOException if it couldn't be saved
     */
    public synchronized Approval approve(UUID player, String deviceId, Instant now) {
        AwaitingApproval awaiting = find(player, deviceId, now);
        if (awaiting == null) return new Approval.NotFound();
        if (!store.addDevice(awaiting.device, MAX_DEVICES_PER_PLAYER)) {
            return new Approval.TooManyDevices();
        }
        awaitingApproval.remove(deviceId);
        return new Approval.Approved(awaiting.device);
    }

    /**
     * Refuses one of {@code player}'s devices waiting for approval.
     *
     * @return the device, or empty if there's no such request or it expired
     */
    public Optional<Device> deny(UUID player, String deviceId, Instant now) {
        return end(player, deviceId, ApprovalStatus.DENIED, now);
    }

    public void playerOffline(UUID player, String deviceId, Instant now) {
        end(player, deviceId, ApprovalStatus.PLAYER_OFFLINE, now);
    }

    private synchronized Optional<Device> end(
            UUID player, String deviceId, ApprovalStatus status, Instant now) {
        AwaitingApproval awaiting = find(player, deviceId, now);
        if (awaiting == null) return Optional.empty();
        // Restarted, so the app still sees why if it only checks once its player is back.
        awaitingApproval.put(
                deviceId,
                new AwaitingApproval(awaiting.device, now.plus(APPROVAL_TIME), true, status));
        return Optional.of(awaiting.device);
    }

    private AwaitingApproval find(UUID player, String deviceId, Instant now) {
        forgetExpired(now);
        AwaitingApproval awaiting = awaitingApproval.get(deviceId);
        if (awaiting == null
                || !awaiting.waiting()
                || !awaiting.device.player().id().equals(player)) {
            return null;
        }
        return awaiting;
    }

    private AwaitingApproval findAwaiting(String token, Instant now) {
        forgetExpired(now);
        String hash = Tokens.hash(token);
        return awaitingApproval.values().stream()
                .filter(a -> a.device.tokenHash().equals(hash))
                .findFirst()
                .orElse(null);
    }

    private void forgetExpired(Instant now) {
        awaitingApproval.values().removeIf(a -> !now.isBefore(a.expiresAt));
    }

    /** Every paired device, oldest first. */
    public List<Device> devices() {
        return store.devices();
    }

    /** The devices {@code player} paired, oldest first. */
    public List<Device> devicesOf(UUID player) {
        return store.devicesOf(player);
    }

    /**
     * Unpairs one of {@code player}'s devices.
     *
     * @return the device, or empty if {@code player} has no device with this ID
     */
    public Optional<Device> unpair(UUID player, String deviceId) {
        return store.removeDevice(player, deviceId);
    }
}
