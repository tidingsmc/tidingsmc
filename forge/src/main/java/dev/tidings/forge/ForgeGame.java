package dev.tidings.forge;

import dev.tidings.core.Game;

import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;

import java.io.File;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.util.Objects;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

final class ForgeGame implements Game {
    private static final int TICKS_PER_DAY = 24000;

    private final MinecraftServer server;

    private byte[] icon;

    private long iconModified;

    ForgeGame(MinecraftServer server) {
        this.server = server;
    }

    @Override
    public String serverName() {
        return TidingsConfig.SERVER_NAME.get().strip();
    }

    @Override
    public String motd() {
        // Null when server.properties has none.
        return Objects.requireNonNullElse(server.getMotd(), "");
    }

    @Override
    public synchronized byte[] icon() {
        File file = server.getFile("server-icon.png");
        if (!file.isFile()) return null;
        // Read again only if the owner changed it.
        long modified = file.lastModified();
        if (icon == null || modified != iconModified) {
            try {
                icon = Files.readAllBytes(file.toPath());
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
            iconModified = modified;
        }
        return icon;
    }

    @Override
    public String version() {
        return server.getServerVersion();
    }

    @Override
    public WorldState world() {
        // Worlds are only safe to read on the server thread.
        try {
            return server.submit(
                            () -> {
                                ServerLevel level = server.overworld();
                                long time = level.getDayTime();
                                Weather weather =
                                        level.isThundering()
                                                ? Weather.THUNDER
                                                : level.isRaining() ? Weather.RAIN : Weather.CLEAR;
                                return new WorldState(
                                        time % TICKS_PER_DAY, time / TICKS_PER_DAY, weather);
                            })
                    .get(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted", e);
        } catch (ExecutionException | TimeoutException e) {
            throw new IllegalStateException("Couldn't read the world", e);
        }
    }
}
