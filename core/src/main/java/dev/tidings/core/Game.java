package dev.tidings.core;

import java.util.function.Supplier;

public interface Game {

    String serverName();
    String motd();
    byte[] icon();
    String version();

    WorldState world();

    <T> T onServerThread(Supplier<T> task);

    record WorldState(long dayTime, long day, Weather weather) {}

    enum Weather {
        CLEAR,
        RAIN,
        THUNDER
    }
}
