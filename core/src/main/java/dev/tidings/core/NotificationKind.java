package dev.tidings.core;

public enum NotificationKind {
    PLAYER_JOINED,
    PLAYER_LEFT,
    SERVER_STARTED,
    /** Add-ons' notifications aren't one of these: see {@link Notifier#notifyAddon}. */
    SERVER_STOPPING;

    public boolean isAboutPlayer() {
        return this == PLAYER_JOINED || this == PLAYER_LEFT;
    }
}
