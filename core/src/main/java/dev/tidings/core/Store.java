package dev.tidings.core;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;

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

public final class Store {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private static final Set<PosixFilePermission> OWNER_ONLY =
            PosixFilePermissions.fromString("rw-------");

    private final Path file;
    private final String serverId;
    private final VapidKeys vapidKeys;
    private final List<Device> devices = new ArrayList<>();
    private final Map<UUID, PlayerProfile> knownPlayers = new LinkedHashMap<>();

    private final Map<UUID, Boolean> announced = new LinkedHashMap<>();

    private Store(Path file, String serverId, VapidKeys vapidKeys) {
        this.file = file;
        this.serverId = serverId;
        this.vapidKeys = vapidKeys;
    }

    public static Store open(Path file) throws IOException {
        if (!Files.exists(file)) {
            Store store = new Store(file, newServerId(), VapidKeys.generate());
            store.save();
            return store;
        }
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
            if (json.has("announced")) {
                JsonObject choices = Json.object(json.get("announced"), "announced");
                for (String id : choices.keySet()) {
                    store.announced.put(Json.uuid(id, "announced"), Json.bool(choices, id));
                }
            }
            return store;
        } catch (JsonParseException | IllegalArgumentException e) {
            // Don't start over: that would silently unpair everyone
            throw new IOException("Corrupt Tidings data in " + file + ": " + e.getMessage(), e);
        }
    }

    /** For tests */
    static Store inMemory() {
        return new Store(null, newServerId(), VapidKeys.generate());
    }

    private static String newServerId() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 16);
    }

    public String serverId() {
        return serverId;
    }

    public VapidKeys vapidKeys() {
        return vapidKeys;
    }

    synchronized List<Device> devices() {
        return List.copyOf(devices);
    }

    public synchronized List<Device> devicesOf(UUID player) {
        return devices.stream().filter(d -> d.player().id().equals(player)).toList();
    }

    public synchronized Optional<Device> deviceByToken(String token) {
        String hash = Tokens.hash(token);
        return devices.stream().filter(d -> d.tokenHash().equals(hash)).findFirst();
    }

    synchronized void addDevice(Device device) {
        devices.add(device);
        try {
            save();
        } catch (UncheckedIOException e) {
            devices.remove(device);
            throw e;
        }
    }

    public synchronized boolean addDevice(Device device, int maxPerPlayer) {
        if (hasMaxDevices(device.player().id(), maxPerPlayer)) return false;
        addDevice(device);
        return true;
    }

    public synchronized boolean hasMaxDevices(UUID player, int maxPerPlayer) {
        return devicesOf(player).size() >= maxPerPlayer;
    }

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

    public synchronized Optional<PlayerProfile> knownPlayer(UUID id) {
        return Optional.ofNullable(knownPlayers.get(id));
    }

    public synchronized List<PlayerProfile> knownPlayers() {
        return knownPlayers.values().stream()
                .sorted(Comparator.comparing(PlayerProfile::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public synchronized Boolean announcedChoice(UUID player) {
        return announced.get(player);
    }

    public synchronized void setAnnounced(UUID player, boolean announce) {
        Boolean previous = announced.put(player, announce);
        try {
            save();
        } catch (UncheckedIOException e) {
            if (previous == null) announced.remove(player);
            else announced.put(player, previous);
            throw e;
        }
    }

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
        JsonObject choices = new JsonObject();
        announced.forEach(
                (id, announce) -> choices.add(id.toString(), new JsonPrimitive(announce)));
        json.add("announced", choices);
        try {
            Files.createDirectories(file.toAbsolutePath().getParent());
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            write(tmp, GSON.toJson(json).getBytes(StandardCharsets.UTF_8));
            Files.move(
                    tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException("Couldn't save Tidings data to " + file, e);
        }
    }
}
