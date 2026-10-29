package dev.tidings.core;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Entry point that platform adapters (Forge, later others) talk to. Knows nothing about Minecraft:
 * adapters translate game events into these calls.
 */
public final class Tidings {
    private final Map<UUID, OnlinePlayer> online = new LinkedHashMap<>();

    public synchronized void playerJoined(UUID id, String name) {
        online.put(id, new OnlinePlayer(id, name));
    }

    public synchronized void playerLeft(UUID id) {
        online.remove(id);
    }

    public synchronized List<OnlinePlayer> onlinePlayers() {
        return List.copyOf(online.values());
    }
}
