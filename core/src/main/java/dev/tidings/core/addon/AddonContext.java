package dev.tidings.core.addon;

import dev.tidings.core.PlayerProfile;

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * What Tidings offers an add-on besides answering its views and actions, given back when it
 * registers. Keep it for as long as your mod runs: it works across server restarts. Its methods can
 * be called from any thread
 *
 * <p>While Tidings isn't running (the server is starting or stopping, or Tidings isn't set up),
 * notifications are dropped, every player counts as hidden and none is known
 */
public final class AddonContext {
    private final Addons addons;
    private final Addon addon;

    AddonContext(Addons addons, Addon addon) {
        this.addons = addons;
        this.addon = addon;
    }

    /** The add-on's ID, which is its mod's */
    public String addonId() {
        return addon.id();
    }

    /**
     * Sends a push to the paired devices that want it, without waiting. Tidings drops what's over
     * {@link Addons#MAX_NOTIFICATIONS_PER_MINUTE} a minute for each add-on, and anything about a
     * player hidden from phones. Each device can turn off an add-on's notifications in the app
     */
    public void notify(Notification notification) {
        Objects.requireNonNull(notification, "notification");
        Addons.Host host = addons.host();
        if (host != null) host.notify(addon.id(), notification);
    }

    /**
     * Whether {@code player} chose to be hidden from phones, with {@code /tidings hide}, or is
     * hidden because of the server's settings. Leave them out of what other players see, such as
     * leaderboards; they can still see their own data
     */
    public boolean isHidden(UUID player) {
        Addons.Host host = addons.host();
        return host == null || !host.isAnnounced(player);
    }

    /**
     * The name and skin Tidings remembers for {@code player}, hidden or not: anyone who joined
     * since Tidings was installed
     */
    public Optional<PlayerProfile> player(UUID player) {
        Addons.Host host = addons.host();
        return host == null ? Optional.empty() : host.knownPlayer(player);
    }
}
