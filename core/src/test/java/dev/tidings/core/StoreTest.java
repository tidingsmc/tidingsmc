package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

class StoreTest {
    @TempDir Path dir;

    private final PlayerProfile steve =
            new PlayerProfile(UUID.randomUUID(), "Steve", "http://textures.minecraft.net/a");

    private Device device(String id) {
        return new Device(
                id,
                Tokens.hash("token-" + id),
                "Pixel",
                steve,
                Instant.parse("2026-10-29T12:00:00Z"),
                DeviceSettings.defaults(),
                null);
    }

    @Test
    void keepsEverythingAcrossRestarts() throws IOException {
        Path file = dir.resolve("tidings/data.json");
        Store store = Store.open(file);
        store.addDevice(device("a"));
        store.updateDevice(
                "a",
                d ->
                        d.withPush(
                                new PushSubscription(
                                        URI.create("https://push.example/1"),
                                        VapidKeys.generate().applicationServerKey(),
                                        "BTBZMqHH6r4Tts7J_aSIgg")));
        store.addDevice(device("b"));
        store.removeDevice(steve.id(), "b");
        store.rememberPlayer(steve);

        Store reopened = Store.open(file);

        assertEquals(store.serverId(), reopened.serverId());
        assertEquals(
                store.vapidKeys().applicationServerKey(),
                reopened.vapidKeys().applicationServerKey());
        assertEquals(store.devices(), reopened.devices());
        assertEquals(List.of(steve), reopened.knownPlayers());
    }

    @Test
    void findsDevicesByToken() {
        Store store = Store.inMemory();
        store.addDevice(device("a"));

        assertEquals("a", store.deviceByToken("token-a").orElseThrow().id());
        assertFalse(store.deviceByToken("token-b").isPresent());
    }

    @Test
    void refusesToStartOverFromACorruptFile() throws IOException {
        Path file = dir.resolve("data.json");
        Files.writeString(file, "{not json");

        assertThrows(IOException.class, () -> Store.open(file));
    }

    @Test
    void dropsASavedPushSubscriptionThatIsNoLongerValid() throws IOException {
        Path file = dir.resolve("data.json");
        Store.open(file).addDevice(device("a"));
        JsonObject json = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
        json.getAsJsonArray("devices")
                .get(0)
                .getAsJsonObject()
                .add(
                        "push",
                        JsonParser.parseString(
                                "{\"endpoint\":\"https://push.example/1\","
                                        + "\"keys\":{\"p256dh\":\"BKey\",\"auth\":\"secret\"}}"));
        Files.writeString(file, json.toString());

        Store reopened = Store.open(file);

        assertEquals("a", reopened.devices().get(0).id());
        assertNull(reopened.devices().get(0).push());
    }

    @Test
    void onlyRemovesThePlayersOwnDevices() {
        Store store = Store.inMemory();
        store.addDevice(device("a"));

        assertFalse(store.removeDevice(UUID.randomUUID(), "a").isPresent());
        assertEquals("a", store.removeDevice(steve.id(), "a").orElseThrow().id());
        assertEquals(List.of(), store.devices());
    }

    /** A directory where the store writes its temporary file makes every save fail. */
    private static void breakSaving(Path file) throws IOException {
        Files.createDirectory(file.resolveSibling(file.getFileName() + ".tmp"));
    }

    @Test
    void keepsTheDeviceIfRemovingItCantBeSaved() throws IOException {
        Path file = dir.resolve("data.json");
        Store store = Store.open(file);
        store.addDevice(device("a"));
        breakSaving(file);

        assertThrows(UncheckedIOException.class, () -> store.removeDevice(steve.id(), "a"));
        assertEquals(List.of(device("a")), store.devices());
    }

    @Test
    void aFirstJoinThatCantBeSavedIsStillAFirstJoinNextTime() throws IOException {
        Path file = dir.resolve("data.json");
        Store store = Store.open(file);
        breakSaving(file);

        assertThrows(UncheckedIOException.class, () -> store.rememberPlayer(steve));
        assertEquals(List.of(), store.knownPlayers());
        Files.delete(file.resolveSibling(file.getFileName() + ".tmp"));
        assertTrue(store.rememberPlayer(steve));
    }
}
