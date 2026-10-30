package dev.tidings.core;

public interface Game {
    /** The name the owner chose for the app to suggest when pairing, if defined */
    String serverName();

    /** The server description */
    String motd();

    /** server-icon.png, if defined */
    byte[] icon();

    String version();

    WorldState world();

    /** The overworld's state, as seen in game. */
    record WorldState(long dayTime, long day, Weather weather) {}

    enum Weather {
        CLEAR,
        RAIN,
        THUNDER
    }
}
