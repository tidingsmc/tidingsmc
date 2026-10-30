package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.jupiter.api.Test;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

class NotificationsTest {
    private final PlayerProfile steve = new PlayerProfile(UUID.randomUUID(), "Steve", null);
    private final PlayerProfile alex =
            new PlayerProfile(
                    UUID.randomUUID(), "Alex", "http://textures.minecraft.net/texture/abc");
    private final Instant t0 = Instant.parse("2026-10-30T12:00:00Z");

    private record Sent(PushSubscription to, String payload, String topic) {
        JsonObject json() {
            return JsonParser.parseString(payload).getAsJsonObject();
        }
    }

    private final List<Sent> sent = new ArrayList<>();
    private PushSender.Result answer = PushSender.Result.DELIVERED;
    private final Tidings tidings =
            new Tidings(
                    Store.inMemory(),
                    new FakeGame(),
                    (to, payload, ttl, topic) -> {
                        sent.add(new Sent(to, new String(payload, StandardCharsets.UTF_8), topic));
                        return CompletableFuture.completedFuture(answer);
                    });

    private static PushSubscription push(String id) {
        return new PushSubscription(
                URI.create("https://push.example/" + id),
                VapidKeys.generate().applicationServerKey(),
                "BTBZMqHH6r4Tts7J_aSIgg");
    }

    private PushSubscription pairDevice(String id, PlayerProfile player, DeviceSettings settings) {
        PushSubscription push = push(id);
        tidings.store().addDevice(new Device(id, "hash-" + id, id, player, t0, settings, push));
        return push;
    }

    private PushSubscription pairDevice(String id, PlayerProfile player) {
        return pairDevice(id, player, DeviceSettings.defaults());
    }

    private static DeviceSettings withLeaves() {
        DeviceSettings d = DeviceSettings.defaults();
        return new DeviceSettings(
                d.notifyJoins(),
                true,
                d.notifyServerStatus(),
                d.quietWhileOnline(),
                d.friends(),
                d.quietHours(),
                d.timeZone());
    }

    private Instant later(Duration d) {
        return t0.plus(d);
    }

    @Test
    void joinsReachOtherPlayersDevices() {
        PushSubscription stevesPhone = pairDevice("steves-phone", steve);
        pairDevice("alexs-phone", alex);

        tidings.playerJoined(alex, t0);

        assertEquals(1, sent.size(), "not Alex's own phone");
        assertEquals(stevesPhone, sent.get(0).to());
        JsonObject message = sent.get(0).json();
        assertEquals("player_joined", message.get("kind").getAsString());
        assertEquals("Alex", message.getAsJsonObject("player").get("name").getAsString());
        assertEquals(
                alex.id().toString(), message.getAsJsonObject("player").get("uuid").getAsString());
        assertEquals(
                alex.skinUrl(), message.getAsJsonObject("player").get("skinUrl").getAsString());
    }

    @Test
    void devicesWithoutASubscriptionAreSkipped() {
        tidings.store()
                .addDevice(
                        new Device(
                                "no-push",
                                "hash",
                                "Phone",
                                steve,
                                t0,
                                DeviceSettings.defaults(),
                                null));

        tidings.playerJoined(alex, t0);

        assertEquals(List.of(), sent);
    }

    @Test
    void quietWhileTheirPlayerIsOnline() {
        pairDevice("steves-phone", steve);
        tidings.playerJoined(steve, t0);
        sent.clear();

        tidings.playerJoined(alex, t0);

        assertEquals(List.of(), sent);
    }

    @Test
    void leavesAreAnnouncedRightAway() {
        pairDevice("steves-phone", steve, withLeaves());
        tidings.playerJoined(alex, t0);
        sent.clear();

        tidings.playerLeft(alex.id(), t0);

        assertEquals(1, sent.size());
        assertEquals("player_left", sent.get(0).json().get("kind").getAsString());
        assertEquals(
                "Alex", sent.get(0).json().getAsJsonObject("player").get("name").getAsString());
    }

    @Test
    void aPlayerNotOnlineIsNotAnnouncedLeaving() {
        pairDevice("steves-phone", steve, withLeaves());

        tidings.playerLeft(alex.id(), t0);

        assertEquals(List.of(), sent);
    }

    @Test
    void newsAboutOnePlayerSharesATopic() {
        pairDevice("steves-phone", steve, withLeaves());
        tidings.playerJoined(alex, t0);
        tidings.playerLeft(alex.id(), t0);

        assertEquals(2, sent.size());
        assertEquals(sent.get(0).topic(), sent.get(1).topic());
        assertTrue(sent.get(0).topic().matches("[A-Za-z0-9_-]{1,32}"), sent.get(0).topic());
    }

    @Test
    void serverStatus() {
        pairDevice("steves-phone", steve, withLeaves());

        tidings.serverStarted(t0);
        tidings.playerJoined(alex, t0);
        assertTrue(tidings.serverStopping(t0).isDone());
        // Kicked by the shutdown: "stopping" said it already.
        tidings.playerLeft(alex.id(), t0);

        assertEquals(
                List.of("server_started", "player_joined", "server_stopping"),
                sent.stream().map(s -> s.json().get("kind").getAsString()).toList());
        assertFalse(sent.get(0).json().has("player"));
    }

    @Test
    void expiredSubscriptionsAreDroppedButTheDeviceStaysPaired() {
        pairDevice("steves-phone", steve);
        answer = PushSender.Result.GONE;

        tidings.playerJoined(alex, t0);

        Device device = tidings.devicesOf(steve.id()).get(0);
        assertNull(device.push());
        sent.clear();
        tidings.playerLeft(alex.id(), t0);
        tidings.playerJoined(alex, later(Duration.ofHours(1)));
        assertEquals(List.of(), sent, "nothing sent to it until the app subscribes again");
    }

    @Test
    void aNewerSubscriptionIsKeptWhenAnOldOneExpires() {
        pairDevice("steves-phone", steve);
        PushSubscription renewed = push("renewed");
        // The app sends its new subscription while a push to the old one is on its way.
        CompletableFuture<PushSender.Result> answered = new CompletableFuture<>();
        Tidings slow =
                new Tidings(tidings.store(), new FakeGame(), (to, payload, ttl, topic) -> answered);
        slow.playerJoined(alex, t0);
        tidings.store().updateDevice("steves-phone", d -> d.withPush(renewed));

        answered.complete(PushSender.Result.GONE);

        assertEquals(renewed, tidings.devicesOf(steve.id()).get(0).push());
    }
}
