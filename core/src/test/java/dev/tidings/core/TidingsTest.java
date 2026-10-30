package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

class TidingsTest {
    private final PlayerProfile steve = new PlayerProfile(UUID.randomUUID(), "Steve", null);
    private final PlayerProfile alex = new PlayerProfile(UUID.randomUUID(), "Alex", null);

    @Test
    void tracksOnlinePlayersInJoinOrder() {
        Tidings tidings = new Tidings(Store.inMemory(), new FakeGame());
        tidings.playerJoined(steve);
        tidings.playerJoined(alex);

        assertEquals(List.of(steve, alex), tidings.onlinePlayers());
    }

    @Test
    void forgetsPlayersWhoLeft() {
        Tidings tidings = new Tidings(Store.inMemory(), new FakeGame());
        tidings.playerJoined(steve);
        tidings.playerJoined(alex);
        tidings.playerLeft(steve.id());

        assertEquals(List.of(alex), tidings.onlinePlayers());
    }

    @Test
    void remembersEveryoneWhoPlayed() {
        Tidings tidings = new Tidings(Store.inMemory(), new FakeGame());
        tidings.playerJoined(steve);
        tidings.playerJoined(alex);
        tidings.playerLeft(steve.id());

        assertEquals(List.of(alex, steve), tidings.store().knownPlayers());
    }

    private static Device device(String id, PlayerProfile player) {
        return new Device(
                id, "hash-" + id, id, player, Instant.EPOCH, DeviceSettings.defaults(), null);
    }

    @Test
    void listsAPlayersDevices() {
        Tidings tidings = new Tidings(Store.inMemory(), new FakeGame());
        tidings.store().addDevice(device("pixel", steve));
        tidings.store().addDevice(device("iphone", alex));
        tidings.store().addDevice(device("tablet", steve));

        assertEquals(
                List.of("pixel", "tablet"),
                tidings.devicesOf(steve.id()).stream().map(Device::id).toList());
    }

    @Test
    void noPairingCodeBeyondTheDeviceLimit() {
        Tidings tidings = new Tidings(Store.inMemory(), new FakeGame());
        for (int i = 1; i < Tidings.MAX_DEVICES_PER_PLAYER; i++) {
            tidings.store().addDevice(device("d" + i, steve));
        }
        assertTrue(tidings.startPairing(steve, Instant.EPOCH).isPresent());

        tidings.store().addDevice(device("last", steve));

        assertTrue(tidings.startPairing(steve, Instant.EPOCH).isEmpty());
        assertTrue(tidings.startPairing(alex, Instant.EPOCH).isPresent());
    }

    @Test
    void tellsFirstJoinsApart() {
        Tidings tidings = new Tidings(Store.inMemory(), new FakeGame());

        assertTrue(tidings.playerJoined(steve));
        tidings.playerLeft(steve.id());
        assertFalse(tidings.playerJoined(steve));
    }
}
