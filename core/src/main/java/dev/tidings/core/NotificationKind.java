package dev.tidings.core;

public enum NotificationKind {
    PLAYER_JOINED,
    PLAYER_LEFT,
    SERVER_STARTED,
    SERVER_STOPPING;

    public boolean isAboutPlayer() {
        return this == PLAYER_JOINED || this == PLAYER_LEFT;
    }
}
