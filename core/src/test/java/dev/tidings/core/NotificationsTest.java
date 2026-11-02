package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import dev.tidings.core.addon.Addon;
import dev.tidings.core.addon.AddonContext;
import dev.tidings.core.addon.Addons;
import dev.tidings.core.addon.Link;
import dev.tidings.core.addon.Notification;
import dev.tidings.core.addon.View;

import org.junit.jupiter.api.Test;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
                d.timeZone(),
                d.mutedAddons());
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
        CompletableFuture<PushSender.Result> answered = new CompletableFuture<>();
        Tidings slow =
                new Tidings(tidings.store(), new FakeGame(), (to, payload, ttl, topic) -> answered);
        slow.playerJoined(alex, t0);
        tidings.store().updateDevice("steves-phone", d -> d.withPush(renewed));

        answered.complete(PushSender.Result.GONE);

        assertEquals(renewed, tidings.devicesOf(steve.id()).get(0).push());
    }

    @Test
    void hiddenPlayersArentAnnouncedJoiningOrLeaving() {
        pairDevice("steves-phone", steve, withLeaves());
        tidings.setAnnounced(alex.id(), false);

        tidings.playerJoined(alex, t0);
        tidings.playerLeft(alex.id(), t0);

        assertEquals(List.of(), sent);
    }

    @Test
    void hidingWhileOnlineMeansNoLeaveEither() {
        pairDevice("steves-phone", steve, withLeaves());
        tidings.playerJoined(alex, t0);
        sent.clear();

        tidings.setAnnounced(alex.id(), false);
        tidings.playerLeft(alex.id(), t0);

        assertEquals(List.of(), sent);
    }

    @Test
    void aHiddenPlayerStillGetsQuietWhileOnline() {
        pairDevice("alexs-phone", alex);
        tidings.setAnnounced(alex.id(), false);
        tidings.playerJoined(alex, t0);

        tidings.playerJoined(steve, t0);

        assertEquals(List.of(), sent);
    }

    @Test
    void whenTheOwnerAnnouncesNoOneByDefaultPlayersShowThemselves() {
        Tidings optIn =
                new Tidings(
                        tidings.store(),
                        new FakeGame(),
                        (to, payload, ttl, topic) -> {
                            sent.add(
                                    new Sent(
                                            to,
                                            new String(payload, StandardCharsets.UTF_8),
                                            topic));
                            return CompletableFuture.completedFuture(answer);
                        },
                        false);
        pairDevice("steves-phone", steve);

        optIn.playerJoined(alex, t0);
        assertEquals(List.of(), sent);

        optIn.setAnnounced(alex.id(), true);
        optIn.playerJoined(alex, later(Duration.ofHours(1)));
        assertEquals(1, sent.size());
    }

    @Test
    void addonNotificationsCarryTheirTextAndLink() {
        PushSubscription stevesPhone = pairDevice("steves-phone", steve);
        pairDevice("alexs-phone", alex);

        tidings.addonNotified(
                "vanilla",
                Notification.of("Alex fell from a high place")
                        .about(alex)
                        .link(Link.to("player", Map.of("id", alex.id().toString()))),
                t0);

        assertEquals(1, sent.size(), "not Alex's own phone");
        assertEquals(stevesPhone, sent.get(0).to());
        JsonObject message = sent.get(0).json();
        assertEquals("addon", message.get("kind").getAsString());
        assertEquals("vanilla", message.get("addon").getAsString());
        assertEquals("Alex fell from a high place", message.get("text").getAsString());
        assertEquals("Alex", message.getAsJsonObject("player").get("name").getAsString());
        JsonObject link = message.getAsJsonObject("link");
        assertEquals("player", link.get("view").getAsString());
        assertEquals(alex.id().toString(), link.getAsJsonObject("params").get("id").getAsString());
    }

    @Test
    void addonNewsDoesntReplaceJoinsInThePushQueue() {
        pairDevice("steves-phone", steve);

        tidings.playerJoined(alex, t0);
        tidings.playerLeft(alex.id(), t0);
        tidings.addonNotified("vanilla", Notification.of("Alex died").about(alex), t0);
        tidings.addonNotified("other", Notification.of("Alex won").about(alex), t0);
        tidings.addonNotified("vanilla", Notification.of("Server news"), t0);

        List<String> topics = sent.stream().map(Sent::topic).toList();
        assertEquals(4, topics.size());
        assertEquals(4, Set.copyOf(topics).size(), "one queue each: " + topics);
    }

    @Test
    void addonNewsAboutHiddenPlayersIsDropped() {
        pairDevice("steves-phone", steve);
        tidings.setAnnounced(alex.id(), false);

        tidings.addonNotified("vanilla", Notification.of("Alex died").about(alex), t0);

        assertEquals(List.of(), sent);
    }

    @Test
    void mutedAddonsArentHeard() {
        pairDevice(
                "steves-phone",
                steve,
                DeviceSettings.defaults().withMutedAddons(Set.of("vanilla")));

        tidings.addonNotified("vanilla", Notification.of("Server news"), t0);
        assertEquals(List.of(), sent);

        tidings.addonNotified("bounties", Notification.of("New bounty"), t0);
        assertEquals(1, sent.size());
    }

    @Test
    void addonNotificationsCanBeForSomePlayersOnly() {
        PushSubscription stevesPhone = pairDevice("steves-phone", steve);
        pairDevice("alexs-phone", alex);

        tidings.addonNotified(
                "bounties", Notification.of("Your bounty was claimed").to(List.of(steve.id())), t0);

        assertEquals(List.of(stevesPhone), sent.stream().map(Sent::to).toList());
    }

    @Test
    void eachAddonHasAFewNotificationsAMinute() {
        pairDevice("steves-phone", steve);

        for (int i = 0; i < Addons.MAX_NOTIFICATIONS_PER_MINUTE + 5; i++) {
            tidings.addonNotified("vanilla", Notification.of("News " + i), t0);
        }
        tidings.addonNotified("bounties", Notification.of("Other add-on"), t0);
        assertEquals(Addons.MAX_NOTIFICATIONS_PER_MINUTE + 1, sent.size());

        sent.clear();
        tidings.addonNotified("vanilla", Notification.of("Later"), later(Duration.ofSeconds(61)));
        assertEquals(1, sent.size());
    }

    @Test
    void addonsAreQuietOnceTheServerStops() {
        pairDevice("steves-phone", steve);
        tidings.serverStopping(t0);
        sent.clear();

        tidings.addonNotified("vanilla", Notification.of("Server news"), t0);

        assertEquals(List.of(), sent);
    }

    @Test
    void addonContextsReachTheRunningTidings() {
        pairDevice("steves-phone", steve);
        tidings.rememberPlayer(alex);
        AddonContext context =
                tidings.addons()
                        .add(
                                Addon.builder("Vanilla")
                                        .view("home", r -> View.of(null))
                                        .build("vanilla"));
        context.notify(Notification.of("While the server starts"));
        assertTrue(context.isHidden(alex.id()), "nobody's known before the server started");
        tidings.serverStarted(t0);
        sent.clear();

        assertFalse(context.isHidden(alex.id()));
        assertEquals(alex, context.player(alex.id()).orElseThrow());
        context.notify(Notification.of("Server news"));
        assertEquals(1, sent.size());

        tidings.serverStopping(t0);
        sent.clear();
        assertTrue(context.isHidden(alex.id()), "nobody's known once the server stops");
        assertTrue(context.player(alex.id()).isEmpty());
        context.notify(Notification.of("Dropped"));
        assertEquals(List.of(), sent);
    }
}
