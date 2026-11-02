package dev.tidings.core.addon;

import java.time.Duration;
import java.util.List;
import java.util.Objects;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import dev.tidings.core.PlayerProfile;

/**
 * A page of an add-on as the app shows it in the server's tab for this add-on
 *
 * @param title shown above the blocks, or null for none
 * @param player who the page is about, whose face shows next to its title, or null
 * @param refresh seconds between reloads while the page is open, or 0 for none
 */
public record View(String title, List<Block> blocks, PlayerProfile player, int refresh) {
    public static final int VERSION = 3;
    public static final Duration MIN_REFRESH = Duration.ofSeconds(2);
    public static final Duration MAX_REFRESH = Duration.ofHours(1);

    public View {
        blocks = List.copyOf(blocks);
        blocks.forEach(Objects::requireNonNull);
        if (refresh != 0
                && (refresh < MIN_REFRESH.toSeconds() || refresh > MAX_REFRESH.toSeconds())) {
            throw new IllegalArgumentException(
                    "refresh must be between " + MIN_REFRESH.toSeconds() + " and "
                            + MAX_REFRESH.toSeconds() + " seconds: " + refresh);
        }
    }

    public static View of(String title, Block... blocks) {
        return new View(title, List.of(blocks), null, 0);
    }

    public static View of(String title, List<Block> blocks) {
        return new View(title, blocks, null, 0);
    }

    public View player(PlayerProfile player) {
        return new View(title, blocks, Objects.requireNonNull(player, "player"), refresh);
    }

    public View refreshEvery(Duration every) {
        long seconds = Objects.requireNonNull(every, "every").toSeconds();
        if (seconds == 0) seconds = -1;
        return new View(title, blocks, player, (int) Math.min(seconds, Integer.MAX_VALUE));
    }

    public JsonObject toJson() {
        JsonObject json = new JsonObject();
        json.addProperty("version", VERSION);
        if (title != null) json.addProperty("title", title);
        if (player != null) {
            JsonObject p = new JsonObject();
            p.addProperty("uuid", player.id().toString());
            p.addProperty("name", player.name());
            if (player.skinUrl() != null) p.addProperty("skinUrl", player.skinUrl());
            json.add("player", p);
        }
        if (refresh > 0) json.addProperty("refresh", refresh);
        JsonArray array = new JsonArray();
        blocks.forEach(block -> array.add(block.toJson()));
        json.add("blocks", array);
        return json;
    }
}
