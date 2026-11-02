package dev.tidings.core;

import java.util.function.Supplier;

final class FakeGame implements Game {
    String motd = "§6A Minecraft Server";
    byte[] icon;

    /** Null to make serverName() fail */
    String serverName = "Test server";

    @Override
    public String serverName() {
        if (serverName == null) throw new IllegalStateException("No server name");
        return serverName;
    }

    @Override
    public String motd() {
        return motd;
    }

    @Override
    public byte[] icon() {
        return icon;
    }

    @Override
    public String version() {
        return "1.20.1";
    }

    @Override
    public WorldState world() {
        return new WorldState(6000, 3, Weather.RAIN);
    }

    @Override
    public <T> T onServerThread(Supplier<T> task) {
        return task.get();
    }
}
