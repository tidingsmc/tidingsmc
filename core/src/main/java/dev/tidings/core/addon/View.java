package dev.tidings.core.addon;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.List;
import java.util.Objects;

/**
 * A page of an add-on, as the app shows it in the server's tab for this add-on.
 *
 * @param title shown above the blocks, or null for none
 */
public record View(String title, List<Block> blocks) {
    /**
     * The blocks this version of Tidings knows. The app shows "update Tidings" in place of blocks
     * it doesn't know, when an add-on was built for a newer one.
     */
    public static final int VERSION = 1;

    public View {
        blocks = List.copyOf(blocks);
        blocks.forEach(Objects::requireNonNull);
    }

    public static View of(String title, Block... blocks) {
        return new View(title, List.of(blocks));
    }

    public static View of(String title, List<Block> blocks) {
        return new View(title, blocks);
    }

    public JsonObject toJson() {
        JsonObject json = new JsonObject();
        json.addProperty("version", VERSION);
        if (title != null) json.addProperty("title", title);
        JsonArray array = new JsonArray();
        blocks.forEach(block -> array.add(block.toJson()));
        json.add("blocks", array);
        return json;
    }
}
