package dev.tidings.core;

import java.util.function.Supplier;

public interface Game {
    /** The name the owner chose for the app to suggest when pairing, if defined */
    String serverName();

    /** The server description */
    String motd();

    /** server-icon.png, if defined */
    byte[] icon();

    String version();

    WorldState world();

    /**
     * Runs {@code task} on the server thread and waits for it, for code that touches the game, such
     * as add-ons'. Its exceptions are thrown as they are. Once it has started, it's waited for
     * longer, so that a timeout almost always means it never ran.
     *
     * @throws IllegalStateException if it doesn't start in a few seconds (then it never will), if
     *     it's still running long after, or if the server is stopping
     */
    <T> T onServerThread(Supplier<T> task);

    /** The overworld's state, as seen in game. */
    record WorldState(long dayTime, long day, Weather weather) {}

    enum Weather {
        CLEAR,
        RAIN,
        THUNDER
    }
}
