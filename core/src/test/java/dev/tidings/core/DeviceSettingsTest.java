package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonParser;

import dev.tidings.core.FriendFilter.Friend;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

class DeviceSettingsTest {
    private static final Instant NOON_UTC = Instant.parse("2026-10-29T12:00:00Z");
    private static final ZoneId UTC = ZoneId.of("UTC");
    private static final UUID STEVE = UUID.randomUUID();
    private static final UUID ALEX = UUID.randomUUID();

    private static final UUID ME = UUID.randomUUID();

    private static DeviceSettings everything(
            FriendFilter friends, QuietHours quietHours, ZoneId timeZone) {
        return new DeviceSettings(true, true, true, false, friends, quietHours, timeZone, Set.of());
    }

    @Test
    void defaultsNotifyJoinsAndServerStatusButNotLeaves() {
        DeviceSettings settings = DeviceSettings.defaults();

        assertTrue(settings.wants(NotificationKind.PLAYER_JOINED, STEVE, NOON_UTC, ME, false));
        assertFalse(settings.wants(NotificationKind.PLAYER_LEFT, STEVE, NOON_UTC, ME, false));
        assertTrue(settings.wants(NotificationKind.SERVER_STARTED, null, NOON_UTC, ME, false));
        assertTrue(settings.wants(NotificationKind.SERVER_STOPPING, null, NOON_UTC, ME, false));
    }

    @Test
    void quietWhileOnlineMutesEverythingWhileTheOwnerPlays() {
        DeviceSettings settings = DeviceSettings.defaults();

        assertFalse(settings.wants(NotificationKind.PLAYER_JOINED, STEVE, NOON_UTC, ME, true));
        assertFalse(settings.wants(NotificationKind.SERVER_STOPPING, null, NOON_UTC, ME, true));
        assertTrue(settings.wants(NotificationKind.SERVER_STOPPING, null, NOON_UTC, ME, false));
    }

    @Test
    void neverAboutTheOwnerThemselves() {
        DeviceSettings settings = everything(FriendFilter.off(), QuietHours.off(), UTC);

        assertFalse(settings.wants(NotificationKind.PLAYER_JOINED, STEVE, NOON_UTC, STEVE, true));
        assertFalse(settings.wants(NotificationKind.PLAYER_LEFT, STEVE, NOON_UTC, STEVE, false));
        assertTrue(settings.wants(NotificationKind.PLAYER_LEFT, STEVE, NOON_UTC, ME, false));
    }

    @Test
    void quietHoursMuteEverything() {
        QuietHours lunch =
                new QuietHours(
                        true,
                        List.of(new QuietHours.Period(LocalTime.of(11, 0), LocalTime.of(14, 0))));
        DeviceSettings settings = everything(FriendFilter.off(), lunch, UTC);

        for (NotificationKind kind : NotificationKind.values()) {
            assertFalse(
                    settings.wants(kind, kind.isAboutPlayer() ? STEVE : null, NOON_UTC, ME, false),
                    kind.name());
        }
    }

    @Test
    void quietHoursAreInTheDeviceTimeZone() {
        QuietHours lunch =
                new QuietHours(
                        true,
                        List.of(new QuietHours.Period(LocalTime.of(11, 0), LocalTime.of(14, 0))));

        // Noon UTC is 21:00 in Tokyo.
        assertTrue(
                everything(FriendFilter.off(), lunch, ZoneId.of("Asia/Tokyo"))
                        .wants(NotificationKind.PLAYER_JOINED, STEVE, NOON_UTC, ME, false));
    }

    @Test
    void friendFilterOnlyLetsFriendsThrough() {
        FriendFilter onlySteve = new FriendFilter(true, List.of(new Friend(STEVE, "Steve")));
        DeviceSettings settings = everything(onlySteve, QuietHours.off(), UTC);

        assertTrue(settings.wants(NotificationKind.PLAYER_JOINED, STEVE, NOON_UTC, ME, false));
        assertTrue(settings.wants(NotificationKind.PLAYER_LEFT, STEVE, NOON_UTC, ME, false));
        assertFalse(settings.wants(NotificationKind.PLAYER_JOINED, ALEX, NOON_UTC, ME, false));
        assertFalse(settings.wants(NotificationKind.PLAYER_LEFT, ALEX, NOON_UTC, ME, false));
        assertTrue(
                settings.wants(NotificationKind.SERVER_STARTED, null, NOON_UTC, ME, false),
                "server status still comes");
    }

    @Test
    void friendFilterTurnedOffKeepsTheListButLetsEveryoneThrough() {
        FriendFilter off = new FriendFilter(false, List.of(new Friend(STEVE, "Steve")));

        assertTrue(
                everything(off, QuietHours.off(), UTC)
                        .wants(NotificationKind.PLAYER_JOINED, ALEX, NOON_UTC, ME, false));
    }

    @Test
    void addonsNotifyUnlessMuted() {
        DeviceSettings settings = DeviceSettings.defaults();
        assertTrue(settings.wantsAddon("vanilla", STEVE, NOON_UTC, ME, false));
        assertTrue(settings.wantsAddon("vanilla", null, NOON_UTC, ME, false));

        DeviceSettings muted = settings.withMutedAddons(Set.of("vanilla"));
        assertFalse(muted.wantsAddon("vanilla", STEVE, NOON_UTC, ME, false));
        assertTrue(muted.wantsAddon("bounties", STEVE, NOON_UTC, ME, false));
    }

    @Test
    void addonNotificationsFollowTheSameQuietRules() {
        DeviceSettings settings = DeviceSettings.defaults();
        assertFalse(settings.wantsAddon("vanilla", ME, NOON_UTC, ME, false), "about the owner");
        assertFalse(settings.wantsAddon("vanilla", STEVE, NOON_UTC, ME, true), "owner online");

        QuietHours lunch =
                new QuietHours(
                        true,
                        List.of(new QuietHours.Period(LocalTime.of(11, 0), LocalTime.of(13, 0))));
        assertFalse(
                everything(FriendFilter.off(), lunch, UTC)
                        .wantsAddon("vanilla", STEVE, NOON_UTC, ME, false));
    }

    @Test
    void theFriendFilterIsOnlyForJoinsAndLeaves() {
        FriendFilter onlySteve = new FriendFilter(true, List.of(new Friend(STEVE, "Steve")));
        assertTrue(
                everything(onlySteve, QuietHours.off(), UTC)
                        .wantsAddon("vanilla", ALEX, NOON_UTC, ME, false));
    }

    @Test
    void mutedAddonsRoundTripThroughJson() {
        DeviceSettings muted = DeviceSettings.defaults().withMutedAddons(Set.of("vanilla", "bank"));
        assertEquals(muted, Json.patchSettings(DeviceSettings.defaults(), Json.settings(muted)));

        DeviceSettings stored =
                Json.patchSettings(DeviceSettings.defaults(), JsonParser.parseString("{}"));
        assertEquals(Set.of(), stored.mutedAddons(), "settings saved before add-ons notified");
    }

    @Test
    void invalidMutedAddonsAreRejected() {
        for (String changes :
                List.of(
                        "{\"mutedAddons\": \"vanilla\"}",
                        "{\"mutedAddons\": [1]}",
                        "{\"mutedAddons\": [\"Not An ID\"]}")) {
            assertThrows(
                    IllegalArgumentException.class,
                    () ->
                            Json.patchSettings(
                                    DeviceSettings.defaults(), JsonParser.parseString(changes)),
                    changes);
        }
        Set<String> tooMany = new HashSet<>();
        for (int i = 0; i <= DeviceSettings.MAX_MUTED_ADDONS; i++) tooMany.add("addon" + i);
        assertThrows(
                IllegalArgumentException.class,
                () -> DeviceSettings.defaults().withMutedAddons(tooMany));
    }

    @Test
    void parsesTheAppsTimeZone() {
        assertEquals(ZoneId.of("Europe/Paris"), DeviceSettings.parseTimeZone("Europe/Paris"));
    }

    @Test
    void invalidSettingsFromTheAppAreRejectedAsBadInput() {
        assertThrows(
                IllegalArgumentException.class,
                () -> DeviceSettings.parseTimeZone("Mars/Olympus_Mons"));
        assertThrows(
                IllegalArgumentException.class, () -> DeviceSettings.parseTimeZone("not a zone!"));
        assertThrows(IllegalArgumentException.class, () -> DeviceSettings.parseTimeZone(null));
        assertThrows(IllegalArgumentException.class, () -> everything(null, QuietHours.off(), UTC));
        assertThrows(
                IllegalArgumentException.class,
                () -> everything(FriendFilter.off(), QuietHours.off(), null));
        assertThrows(IllegalArgumentException.class, () -> new FriendFilter(true, null));
        assertThrows(
                IllegalArgumentException.class,
                () -> new FriendFilter(true, Arrays.asList((Friend) null)));
        assertThrows(IllegalArgumentException.class, () -> new Friend(null, "Steve"));
        assertThrows(IllegalArgumentException.class, () -> new QuietHours(true, null));
        assertThrows(
                IllegalArgumentException.class, () -> new QuietHours.Period(null, LocalTime.NOON));
    }
}
