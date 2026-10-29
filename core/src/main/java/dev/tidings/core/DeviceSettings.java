package dev.tidings.core;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.ZoneId;
import java.util.UUID;

/**
 * What a paired device wants to be notified about. Mirrors the app's DeviceSettings.
 *
 * <p>The settings come from the app, so invalid values throw {@link IllegalArgumentException}, here
 * and in {@link FriendFilter} and {@link QuietHours}; the HTTP API answers those with 400 Bad
 * Request.
 *
 * @param timeZone the device's time zone, kept up to date by the app; quiet hours are in this zone
 */
public record DeviceSettings(
        boolean notifyJoins,
        boolean notifyLeaves,
        boolean notifyServerStatus,
        boolean quietWhileOnline,
        FriendFilter friends,
        QuietHours quietHours,
        ZoneId timeZone) {

    public DeviceSettings {
        if (friends == null) throw new IllegalArgumentException("Missing friends");
        if (quietHours == null) throw new IllegalArgumentException("Missing quiet hours");
        if (timeZone == null) throw new IllegalArgumentException("Missing time zone");
    }

    /** A time zone as the app sends it, e.g. "Europe/Paris". */
    public static ZoneId parseTimeZone(String id) {
        if (id == null) throw new IllegalArgumentException("Missing time zone");
        try {
            return ZoneId.of(id);
        } catch (DateTimeException e) {
            throw new IllegalArgumentException("Unknown time zone: " + id, e);
        }
    }

    public static DeviceSettings defaults() {
        return new DeviceSettings(
                true, false, true, true, FriendFilter.off(), QuietHours.off(), ZoneId.of("UTC"));
    }

    /**
     * @param player who joined or left; null for notifications about the server
     * @param owner the player this device belongs to (the one who paired it)
     * @param ownerOnline whether the owner is on the server right now
     */
    public boolean wants(
            NotificationKind kind, UUID player, Instant now, UUID owner, boolean ownerOnline) {
        // Nobody needs telling that they joined or left.
        if (owner.equals(player)) return false;
        if (quietHours.isQuietAt(now, timeZone)) return false;
        // They see it in game.
        if (quietWhileOnline && ownerOnline) return false;
        if (kind.isAboutPlayer() && !friends.allows(player)) return false;
        return switch (kind) {
            case PLAYER_JOINED -> notifyJoins;
            case PLAYER_LEFT -> notifyLeaves;
            case SERVER_STARTED, SERVER_STOPPING -> notifyServerStatus;
        };
    }
}
