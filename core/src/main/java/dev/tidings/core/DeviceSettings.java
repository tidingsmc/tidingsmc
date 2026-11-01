package dev.tidings.core;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * What a paired device wants to be notified about. Mirrors the app's DeviceSettings.
 *
 * @param timeZone the device's time zone, kept up to date by the app; quiet hours are in this zone
 * @param mutedAddons the IDs of the add-ons whose notifications this device doesn't want: add-ons
 *     notify by default, so that one installed later is heard without changing anything
 */
public record DeviceSettings(
        boolean notifyJoins,
        boolean notifyLeaves,
        boolean notifyServerStatus,
        boolean quietWhileOnline,
        FriendFilter friends,
        QuietHours quietHours,
        ZoneId timeZone,
        Set<String> mutedAddons) {

    /** More than any server has add-ons: only there to bound what the app can make us store. */
    public static final int MAX_MUTED_ADDONS = 64;

    private static final Pattern ADDON_ID = Pattern.compile("[a-z0-9_-]{1,64}");

    public DeviceSettings {
        if (friends == null) throw new IllegalArgumentException("Missing friends");
        if (quietHours == null) throw new IllegalArgumentException("Missing quiet hours");
        if (timeZone == null) throw new IllegalArgumentException("Missing time zone");
        if (mutedAddons == null) throw new IllegalArgumentException("Missing muted add-ons");
        if (mutedAddons.size() > MAX_MUTED_ADDONS) {
            throw new IllegalArgumentException("Too many muted add-ons");
        }
        for (String id : mutedAddons) {
            if (id == null || !ADDON_ID.matcher(id).matches()) {
                throw new IllegalArgumentException("Invalid add-on ID: " + id);
            }
        }
        mutedAddons = Set.copyOf(mutedAddons);
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
                true,
                false,
                true,
                true,
                FriendFilter.off(),
                QuietHours.off(),
                ZoneId.of("UTC"),
                Set.of());
    }

    public DeviceSettings withMutedAddons(Set<String> mutedAddons) {
        return new DeviceSettings(
                notifyJoins,
                notifyLeaves,
                notifyServerStatus,
                quietWhileOnline,
                friends,
                quietHours,
                timeZone,
                mutedAddons);
    }

    /**
     * For Tidings' own notifications; see {@link #wantsAddon} for add-ons'.
     *
     * @param player who joined or left; null for notifications about the server
     * @param owner the player this device belongs to (the one who paired it)
     * @param ownerOnline whether the owner is on the server right now
     */
    public boolean wants(
            NotificationKind kind, UUID player, Instant now, UUID owner, boolean ownerOnline) {
        if (muted(player, now, owner, ownerOnline)) return false;
        if (kind.isAboutPlayer() && !friends.allows(player)) return false;
        return switch (kind) {
            case PLAYER_JOINED -> notifyJoins;
            case PLAYER_LEFT -> notifyLeaves;
            case SERVER_STARTED, SERVER_STOPPING -> notifyServerStatus;
        };
    }

    /**
     * The friend filter doesn't apply: it's about joins and leaves. Each add-on can be muted
     * instead.
     *
     * @param player who the notification is about, if anyone
     */
    public boolean wantsAddon(
            String addonId, UUID player, Instant now, UUID owner, boolean ownerOnline) {
        return !mutedAddons.contains(addonId) && !muted(player, now, owner, ownerOnline);
    }

    private boolean muted(UUID player, Instant now, UUID owner, boolean ownerOnline) {
        if (owner.equals(player)) return true;
        if (quietHours.isQuietAt(now, timeZone)) return true;
        return quietWhileOnline && ownerOnline;
    }
}
