package dev.tidings.core;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.FileAttribute;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.UnaryOperator;

/**
 * Everything the mod remembers: the server's ID and push keys, paired devices, and everyone who has
 * played here. Saved to one JSON file after every change; writes throw {@link UncheckedIOException}
 * if that fails.
 */
public final class Store {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private static final Set<PosixFilePermission> OWNER_ONLY =
            PosixFilePermissions.fromString("rw-------");

    private final Path file;
    private final String serverId;
    private final VapidKeys vapidKeys;
    private final List<Device> devices = new ArrayList<>();
    private final Map<UUID, PlayerProfile> knownPlayers = new LinkedHashMap<>();

    private Store(Path file, String serverId, VapidKeys vapidKeys) {
        this.file = file;
        this.serverId = serverId;
        this.vapidKeys = vapidKeys;
    }

    /** Reads {@code file}, or starts a new store there (with a new server ID and keys). */
    public static Store open(Path file) throws IOException {
        if (!Files.exists(file)) {
            Store store = new Store(file, newServerId(), VapidKeys.generate());
            store.save();
            return store;
        }
        // Saved by a version that left it readable by everyone.
        if (isPosix(file)) Files.setPosixFilePermissions(file, OWNER_ONLY);
        try {
            JsonObject json =
                    Json.object(
                            JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)),
                            "data");
            JsonObject keys = Json.object(json.get("vapid"), "vapid");
            Store store =
                    new Store(
                            file,
                            Json.string(json, "serverId"),
                            VapidKeys.decode(
                                    Json.string(keys, "publicKey"),
                                    Json.string(keys, "privateKey")));
            for (JsonElement d : Json.array(json, "devices")) {
                store.devices.add(Json.readDevice(d));
            }
            for (JsonElement p : Json.array(json, "players")) {
                PlayerProfile player = Json.readPlayer(p);
                store.knownPlayers.put(player.id(), player);
            }
            return store;
        } catch (JsonParseException | IllegalArgumentException e) {
            // Don't start over: that would silently unpair everyone.
            throw new IOException("Corrupt Tidings data in " + file + ": " + e.getMessage(), e);
        }
    }

    /** Not saved anywhere, for tests. */
    static Store inMemory() {
        return new Store(null, newServerId(), VapidKeys.generate());
    }

    private static String newServerId() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 16);
    }

    /** Stable ID the app keys this server by, also in its service worker scope. */
    public String serverId() {
        return serverId;
    }

    public VapidKeys vapidKeys() {
        return vapidKeys;
    }

    synchronized List<Device> devices() {
        return List.copyOf(devices);
    }

    /** The devices {@code player} paired, oldest first. */
    public synchronized List<Device> devicesOf(UUID player) {
        return devices.stream().filter(d -> d.player().id().equals(player)).toList();
    }

    public synchronized Optional<Device> deviceByToken(String token) {
        String hash = Tokens.hash(token);
        return devices.stream().filter(d -> d.tokenHash().equals(hash)).findFirst();
    }

    /** Adds {@code device} whatever the device limit, for tests. */
    synchronized void addDevice(Device device) {
        devices.add(device);
        try {
            save();
        } catch (UncheckedIOException e) {
            devices.remove(device);
            throw e;
        }
    }

    /**
     * Adds {@code device} unless its player already has {@code maxPerPlayer} devices.
     *
     * @return whether it was added
     */
    public synchronized boolean addDevice(Device device, int maxPerPlayer) {
        if (hasMaxDevices(device.player().id(), maxPerPlayer)) return false;
        addDevice(device);
        return true;
    }

    public synchronized boolean hasMaxDevices(UUID player, int maxPerPlayer) {
        return devicesOf(player).size() >= maxPerPlayer;
    }

    /**
     * Applies {@code change} to the device with this ID, atomically so concurrent changes to one
     * device don't overwrite each other.
     *
     * @return the updated device, or empty if it was removed meanwhile
     */
    public synchronized Optional<Device> updateDevice(String id, UnaryOperator<Device> change) {
        for (int i = 0; i < devices.size(); i++) {
            Device previous = devices.get(i);
            if (!previous.id().equals(id)) continue;
            Device updated = change.apply(previous);
            devices.set(i, updated);
            try {
                save();
            } catch (UncheckedIOException e) {
                devices.set(i, previous);
                throw e;
            }
            return Optional.of(updated);
        }
        return Optional.empty();
    }

    /**
     * Removes one of {@code player}'s devices.
     *
     * @return the device, or empty if {@code player} has no device with this ID
     */
    public synchronized Optional<Device> removeDevice(UUID player, String id) {
        for (int i = 0; i < devices.size(); i++) {
            Device device = devices.get(i);
            if (!device.id().equals(id) || !device.player().id().equals(player)) continue;
            devices.remove(i);
            try {
                save();
            } catch (UncheckedIOException e) {
                devices.add(i, device);
                throw e;
            }
            return Optional.of(device);
        }
        return Optional.empty();
    }

    /**
     * Records a player who joined, or their new name or skin.
     *
     * @return whether it's their first time here since Tidings was installed
     */
    public synchronized boolean rememberPlayer(PlayerProfile player) {
        PlayerProfile previous = knownPlayers.put(player.id(), player);
        if (!player.equals(previous)) {
            try {
                save();
            } catch (UncheckedIOException e) {
                if (previous == null) knownPlayers.remove(player.id());
                else knownPlayers.put(player.id(), previous);
                throw e;
            }
        }
        return previous == null;
    }

    /** Everyone who has played here since the mod was installed, by name. */
    public synchronized List<PlayerProfile> knownPlayers() {
        return knownPlayers.values().stream()
                .sorted(Comparator.comparing(PlayerProfile::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    /**
     * Readable by the server's owner only: it holds the push keys, which also prove the relay is
     * this server's. On disk before it's renamed, or a power cut could leave an empty file.
     */
    private static void write(Path path, byte[] bytes) throws IOException {
        boolean posix = isPosix(path);
        FileAttribute<?>[] attributes =
                posix
                        ? new FileAttribute<?>[] {PosixFilePermissions.asFileAttribute(OWNER_ONLY)}
                        : new FileAttribute<?>[0];
        try (FileChannel channel =
                FileChannel.open(
                        path,
                        Set.of(
                                StandardOpenOption.CREATE,
                                StandardOpenOption.TRUNCATE_EXISTING,
                                StandardOpenOption.WRITE),
                        attributes)) {
            // A file left by an earlier version or a crash keeps its permissions otherwise.
            if (posix) Files.setPosixFilePermissions(path, OWNER_ONLY);
            ByteBuffer buffer = ByteBuffer.wrap(bytes);
            while (buffer.hasRemaining()) channel.write(buffer);
            channel.force(true);
        }
    }

    private static boolean isPosix(Path path) {
        return path.getFileSystem().supportedFileAttributeViews().contains("posix");
    }

    private void save() {
        if (file == null) return;
        JsonObject json = new JsonObject();
        json.addProperty("serverId", serverId);
        JsonObject keys = new JsonObject();
        keys.addProperty("publicKey", vapidKeys.encodedPublicKey());
        keys.addProperty("privateKey", vapidKeys.encodedPrivateKey());
        json.add("vapid", keys);
        JsonArray deviceList = new JsonArray();
        devices.forEach(d -> deviceList.add(Json.device(d)));
        json.add("devices", deviceList);
        json.add("players", Json.players(List.copyOf(knownPlayers.values())));
        try {
            Files.createDirectories(file.toAbsolutePath().getParent());
            // Write then rename, so a crash mid-write can't leave half a file.
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            write(tmp, GSON.toJson(json).getBytes(StandardCharsets.UTF_8));
            Files.move(
                    tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException("Couldn't save Tidings data to " + file, e);
        }
    }
}
