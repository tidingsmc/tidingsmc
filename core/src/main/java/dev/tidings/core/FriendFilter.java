package dev.tidings.core;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

public record FriendFilter(boolean enabled, List<Friend> players) {

    public FriendFilter {
        if (players == null || players.stream().anyMatch(Objects::isNull))
            throw new IllegalArgumentException("Missing friend");
        players = List.copyOf(players);
    }

    public record Friend(UUID uuid, String name) {
        public Friend {
            if (uuid == null) throw new IllegalArgumentException("A friend needs a UUID");
            if (name == null) throw new IllegalArgumentException("A friend needs a name");
        }
    }

    public static FriendFilter off() {
        return new FriendFilter(false, List.of());
    }

    public boolean allows(UUID player) {
        return !enabled || players.stream().anyMatch(friend -> friend.uuid().equals(player));
    }
}
