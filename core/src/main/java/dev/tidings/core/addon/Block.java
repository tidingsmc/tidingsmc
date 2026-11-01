package dev.tidings.core.addon;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import dev.tidings.core.PlayerProfile;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * A piece of an add-on's {@link View}. The app draws each kind its own way: add-ons describe what
 * to show, not how. Text is always shown as plain text.
 *
 * <p>Mirrors the app's {@code Block} type (app/src/lib/addons.ts).
 */
public sealed interface Block
        permits Block.Heading,
                Block.Text,
                Block.Stats,
                Block.ItemList,
                Block.Progress,
                Block.Choices,
                Block.Button,
                Block.Form,
                Block.Card {

    JsonObject toJson();

    static Heading heading(String text) {
        return new Heading(text);
    }

    static Text text(String text) {
        return new Text(text, false);
    }

    /** Text of lesser importance, like a hint or a footnote. */
    static Text muted(String text) {
        return new Text(text, true);
    }

    static Stats stats(Stat... items) {
        return new Stats(List.of(items));
    }

    static ItemList list(List<ListItem> items) {
        return new ItemList(items, null);
    }

    static Progress progress(String label, long value, long max) {
        return new Progress(label, value, max);
    }

    static Choices choices(List<Choice> items) {
        return new Choices(items);
    }

    /** Calls {@code action} when tapped. */
    static Button button(String label, String action) {
        return new Button(label, action, Map.of(), null, Button.Style.NORMAL, null);
    }

    /** Opens {@code link} when tapped. */
    static Button button(String label, Link link) {
        return new Button(label, null, Map.of(), link, Button.Style.NORMAL, null);
    }

    /** Calls {@code action} with what the player filled in, see {@link Request#values}. */
    static Form form(String action, String submit, Field... fields) {
        return new Form(action, Map.of(), submit, List.of(fields));
    }

    /** Groups blocks together. Can't contain another card. */
    static Card card(Block... blocks) {
        return new Card(List.of(blocks));
    }

    record Heading(String text) implements Block {
        public Heading {
            Objects.requireNonNull(text, "text");
        }

        @Override
        public JsonObject toJson() {
            JsonObject json = typed("heading");
            json.addProperty("text", text);
            return json;
        }
    }

    record Text(String text, boolean muted) implements Block {
        public Text {
            Objects.requireNonNull(text, "text");
        }

        @Override
        public JsonObject toJson() {
            JsonObject json = typed("text");
            json.addProperty("text", text);
            if (muted) json.addProperty("muted", true);
            return json;
        }
    }

    /** Numbers side by side, such as "Deaths 12", "Playtime 3 h". */
    record Stats(List<Stat> items) implements Block {
        public Stats {
            items = List.copyOf(items);
        }

        @Override
        public JsonObject toJson() {
            JsonObject json = typed("stats");
            JsonArray array = new JsonArray();
            for (Stat stat : items) {
                JsonObject item = new JsonObject();
                item.addProperty("label", stat.label());
                item.addProperty("value", stat.value());
                array.add(item);
            }
            json.add("items", array);
            return json;
        }
    }

    /** The value is shown as is: format it for the player's {@link Request#locale}. */
    record Stat(String label, String value) {
        public Stat {
            Objects.requireNonNull(label, "label");
            Objects.requireNonNull(value, "value");
        }

        public static Stat of(String label, String value) {
            return new Stat(label, value);
        }
    }

    /**
     * @param empty shown instead when there are no items, or null
     */
    record ItemList(List<ListItem> items, String empty) implements Block {
        public ItemList {
            items = List.copyOf(items);
        }

        public ItemList empty(String text) {
            return new ItemList(items, text);
        }

        @Override
        public JsonObject toJson() {
            JsonObject json = typed("list");
            JsonArray array = new JsonArray();
            items.forEach(item -> array.add(item.toJson()));
            json.add("items", array);
            if (empty != null) json.addProperty("empty", empty);
            return json;
        }
    }

    /**
     * @param subtitle under the title, or null
     * @param trailing at the end of the row, such as a number, or null
     * @param player whose face to show at the start of the row, or null
     * @param link what tapping the row opens, or null
     */
    record ListItem(
            String title, String subtitle, String trailing, PlayerProfile player, Link link) {
        public ListItem {
            Objects.requireNonNull(title, "title");
        }

        public static ListItem of(String title) {
            return new ListItem(title, null, null, null, null);
        }

        public ListItem subtitle(String subtitle) {
            return new ListItem(title, subtitle, trailing, player, link);
        }

        public ListItem trailing(String trailing) {
            return new ListItem(title, subtitle, trailing, player, link);
        }

        public ListItem player(PlayerProfile player) {
            return new ListItem(title, subtitle, trailing, player, link);
        }

        public ListItem link(Link link) {
            return new ListItem(title, subtitle, trailing, player, link);
        }

        JsonObject toJson() {
            JsonObject json = new JsonObject();
            json.addProperty("title", title);
            if (subtitle != null) json.addProperty("subtitle", subtitle);
            if (trailing != null) json.addProperty("trailing", trailing);
            if (player != null) {
                JsonObject p = new JsonObject();
                p.addProperty("uuid", player.id().toString());
                p.addProperty("name", player.name());
                if (player.skinUrl() != null) p.addProperty("skinUrl", player.skinUrl());
                json.add("player", p);
            }
            if (link != null) json.add("link", link.toJson());
            return json;
        }
    }

    /** A bar filled to {@code value / max}, such as advancements done. */
    record Progress(String label, long value, long max) implements Block {
        public Progress {
            Objects.requireNonNull(label, "label");
            if (max <= 0 || value < 0 || value > max) {
                throw new IllegalArgumentException("Progress needs 0 <= value <= max, max > 0");
            }
        }

        @Override
        public JsonObject toJson() {
            JsonObject json = typed("progress");
            json.addProperty("label", label);
            json.addProperty("value", value);
            json.addProperty("max", max);
            return json;
        }
    }

    /** A row of options, one of them selected, each opening its own view: a sort order, a stat… */
    record Choices(List<Choice> items) implements Block {
        public Choices {
            items = List.copyOf(items);
        }

        @Override
        public JsonObject toJson() {
            JsonObject json = typed("choices");
            JsonArray array = new JsonArray();
            for (Choice choice : items) {
                JsonObject item = new JsonObject();
                item.addProperty("label", choice.label());
                item.add("link", choice.link().toJson());
                if (choice.selected()) item.addProperty("selected", true);
                array.add(item);
            }
            json.add("items", array);
            return json;
        }
    }

    record Choice(String label, Link link, boolean selected) {
        public Choice {
            Objects.requireNonNull(label, "label");
            Objects.requireNonNull(link, "link");
        }

        public static Choice of(String label, Link link, boolean selected) {
            return new Choice(label, link, selected);
        }
    }

    /**
     * Either calls {@code action} with {@code params}, or opens {@code link}.
     *
     * @param confirm asked first, in a dialog, or null
     */
    record Button(
            String label,
            String action,
            Map<String, String> params,
            Link link,
            Style style,
            String confirm)
            implements Block {
        public enum Style {
            NORMAL,
            PRIMARY,
            DANGER
        }

        public Button {
            Objects.requireNonNull(label, "label");
            Objects.requireNonNull(style, "style");
            if ((action == null) == (link == null)) {
                throw new IllegalArgumentException("A button has either an action or a link");
            }
            if (action != null) Names.check(action, "action");
            params = Names.checkParams(params);
        }

        public Button params(Map<String, String> params) {
            return new Button(label, action, params, link, style, confirm);
        }

        public Button style(Style style) {
            return new Button(label, action, params, link, style, confirm);
        }

        public Button confirm(String question) {
            return new Button(label, action, params, link, style, question);
        }

        @Override
        public JsonObject toJson() {
            JsonObject json = typed("button");
            json.addProperty("label", label);
            if (action != null) {
                json.addProperty("action", action);
                if (!params.isEmpty()) json.add("params", Names.toJson(params));
            }
            if (link != null) json.add("link", link.toJson());
            if (style != Style.NORMAL) json.addProperty("style", Names.lower(style));
            if (confirm != null) json.addProperty("confirm", confirm);
            return json;
        }
    }

    /**
     * @param submit the label of its button
     */
    record Form(String action, Map<String, String> params, String submit, List<Field> fields)
            implements Block {
        public Form {
            Names.check(action, "action");
            params = Names.checkParams(params);
            Objects.requireNonNull(submit, "submit");
            fields = List.copyOf(fields);
            if (fields.stream().map(Field::name).distinct().count() != fields.size()) {
                throw new IllegalArgumentException("Two fields of a form have the same name");
            }
        }

        public Form params(Map<String, String> params) {
            return new Form(action, params, submit, fields);
        }

        @Override
        public JsonObject toJson() {
            JsonObject json = typed("form");
            json.addProperty("action", action);
            if (!params.isEmpty()) json.add("params", Names.toJson(params));
            json.addProperty("submit", submit);
            JsonArray array = new JsonArray();
            fields.forEach(field -> array.add(field.toJson()));
            json.add("fields", array);
            return json;
        }
    }

    record Card(List<Block> blocks) implements Block {
        public Card {
            blocks = List.copyOf(blocks);
            if (blocks.stream().anyMatch(b -> b instanceof Card)) {
                throw new IllegalArgumentException("A card can't contain another card");
            }
        }

        @Override
        public JsonObject toJson() {
            JsonObject json = typed("card");
            JsonArray array = new JsonArray();
            blocks.forEach(block -> array.add(block.toJson()));
            json.add("blocks", array);
            return json;
        }
    }

    private static JsonObject typed(String type) {
        JsonObject json = new JsonObject();
        json.addProperty("type", type);
        return json;
    }
}
