package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.tidings.core.FriendFilter.Friend;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

class DeviceSettingsTest {
    private static final Instant NOON_UTC = Instant.parse("2026-10-29T12:00:00Z");
    private static final ZoneId UTC = ZoneId.of("UTC");
    private static final UUID STEVE = UUID.randomUUID();
    private static final UUID ALEX = UUID.randomUUID();

    /** Who the device belongs to. */
    private static final UUID ME = UUID.randomUUID();

    private static DeviceSettings everything(
            FriendFilter friends, QuietHours quietHours, ZoneId timeZone) {
        return new DeviceSettings(true, true, true, false, friends, quietHours, timeZone);
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
        // Even with quietWhileOnline off, and after leaving (no longer online).
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
