package dev.tidings.core.addon;

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
 */
public record View(String title, List<Block> blocks, PlayerProfile player) {
    public static final int VERSION = 3;

    public View {
        blocks = List.copyOf(blocks);
        blocks.forEach(Objects::requireNonNull);
    }

    public static View of(String title, Block... blocks) {
        return new View(title, List.of(blocks), null);
    }

    public static View of(String title, List<Block> blocks) {
        return new View(title, blocks, null);
    }

    /** A page about {@code player}: their face shows next to its title. */
    public View player(PlayerProfile player) {
        return new View(title, blocks, Objects.requireNonNull(player, "player"));
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
        JsonArray array = new JsonArray();
        blocks.forEach(block -> array.add(block.toJson()));
        json.add("blocks", array);
        return json;
    }
}
