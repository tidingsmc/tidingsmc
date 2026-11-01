package dev.tidings.forge;

import dev.tidings.core.Game;

import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;

import java.io.File;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

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
        return onServerThread(
                () -> {
                    ServerLevel level = server.overworld();
                    long time = level.getDayTime();
                    Weather weather =
                            level.isThundering()
                                    ? Weather.THUNDER
                                    : level.isRaining() ? Weather.RAIN : Weather.CLEAR;
                    return new WorldState(time % TICKS_PER_DAY, time / TICKS_PER_DAY, weather);
                });
    }

    @Override
    public <T> T onServerThread(Supplier<T> task) {
        if (server.isSameThread()) return task.get();
        // QUEUED until the server thread takes it, unless the caller gave up on it first.
        AtomicReference<Status> status = new AtomicReference<>(Status.QUEUED);
        CompletableFuture<T> future =
                server.submit(
                        () -> {
                            // submit() runs it right here, on the caller's thread, once the server
                            // has stopped: the game mustn't be touched from there.
                            if (!server.isSameThread()) throw stopping();
                            if (!status.compareAndSet(Status.QUEUED, Status.STARTED)) return null;
                            return task.get();
                        });
        try {
            try {
                return future.get(5, TimeUnit.SECONDS);
            } catch (TimeoutException e) {
                if (status.compareAndSet(Status.QUEUED, Status.ABANDONED)) {
                    // It will never run: the caller can safely retry.
                    throw new IllegalStateException("The server thread is too busy", e);
                }
                // Already running: its effects will happen, so wait for them rather than answer
                // an error that invites a retry, such as a second purchase.
                try {
                    return future.get(30, TimeUnit.SECONDS);
                } catch (TimeoutException stillRunning) {
                    throw new IllegalStateException(
                            "The server thread has been running this for too long", stillRunning);
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted", e);
        } catch (ExecutionException e) {
            if (e.getCause() instanceof RuntimeException cause) throw cause;
            throw new IllegalStateException("Failed on the server thread", e.getCause());
        }
    }

    private enum Status {
        QUEUED,
        STARTED,
        ABANDONED
    }

    private static IllegalStateException stopping() {
        return new IllegalStateException("The server is stopping");
    }
}
