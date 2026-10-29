package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

class TidingsTest {
    private final UUID steve = UUID.randomUUID();
    private final UUID alex = UUID.randomUUID();

    @Test
    void tracksOnlinePlayersInJoinOrder() {
        Tidings tidings = new Tidings();
        tidings.playerJoined(steve, "Steve");
        tidings.playerJoined(alex, "Alex");

        assertEquals(
                List.of(new OnlinePlayer(steve, "Steve"), new OnlinePlayer(alex, "Alex")),
                tidings.onlinePlayers());
    }

    @Test
    void forgetsPlayersWhoLeft() {
        Tidings tidings = new Tidings();
        tidings.playerJoined(steve, "Steve");
        tidings.playerJoined(alex, "Alex");
        tidings.playerLeft(steve);

        assertEquals(List.of(new OnlinePlayer(alex, "Alex")), tidings.onlinePlayers());
    }
}
