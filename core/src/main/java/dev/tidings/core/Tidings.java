package dev.tidings.core;

import java.time.Duration;
import java.time.Instant;
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
    /** Beyond this, players unpair a device themselves before pairing a new one. */
    public static final int MAX_DEVICES_PER_PLAYER = 5;

    /** How long a player has to approve a device in game, once it sent the right code. */
    public static final Duration APPROVAL_TIME = Duration.ofMinutes(5);

    private final Store store;
    private final Game game;
    private final Pairing pairing = new Pairing();
    private final Notifier notifier;
    private final Map<UUID, PlayerProfile> online = new LinkedHashMap<>();

    /** Once set, players leaving aren't announced: the server going down says it. */
    private volatile boolean stopping;

    private final Map<String, AwaitingApproval> awaitingApproval = new HashMap<>();

    private volatile Consumer<Device> approvalListener = device -> {};

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
     */
    public Tidings(Store store, Game game, PushSender push) {
        this.store = store;
        this.game = game;
        this.notifier = new Notifier(store, push);
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
        if (player == null || stopping) return;
        notifier.notify(NotificationKind.PLAYER_LEFT, player, onlineIds(), now);
    }

    public void serverStarted(Instant now) {
        notifier.notify(NotificationKind.SERVER_STARTED, null, onlineIds(), now);
    }

    /**
     * Players disconnected from now on aren't announced leaving: the server going down says it.
     *
     * @return completes once every push got an answer, worth waiting for before the JVM exits
     */
    public CompletableFuture<Void> serverStopping(Instant now) {
        stopping = true;
        return notifier.notify(NotificationKind.SERVER_STOPPING, null, onlineIds(), now);
    }

    private synchronized Set<UUID> onlineIds() {
        return Set.copyOf(online.keySet());
    }

    public synchronized List<PlayerProfile> onlinePlayers() {
        return List.copyOf(online.values());
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
