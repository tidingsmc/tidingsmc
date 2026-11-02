package dev.tidings.core.addon;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import dev.tidings.core.PlayerProfile;

public sealed interface Block
        permits Block.Heading,
                Block.Text,
                Block.Stats,
                Block.ItemList,
                Block.Progress,
                Block.Choices,
                Block.Button,
                Block.Form,
                Block.Chat,
                Block.Card,
                Block.Tree,
                Block.IconBlock,
                Block.Image,
                Block.MapBlock {

    JsonObject toJson();

    static Heading heading(String text) {
        return new Heading(text);
    }

    static Text text(String text) {
        return new Text(text, false);
    }

    /** Text of lesser importance like a hint or a footnote */
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

    /** Calls {@code action} when tapped */
    static Button button(String label, String action) {
        return new Button(label, action, Map.of(), null, Button.Style.NORMAL, null);
    }

    /** Opens {@code link} when tapped */
    static Button button(String label, Link link) {
        return new Button(label, null, Map.of(), link, Button.Style.NORMAL, null);
    }

    /** Calls {@code action} with what the player filled in, see {@link Request#values} */
    static Form form(String action, String submit, Field... fields) {
        return new Form(action, Map.of(), submit, List.of(fields));
    }

    /**
     * A chat as the game shows it with a box under it to write in that calls
     * {@code action} with what was written as the value {@link Chat#VALUE}
     */
    static Chat chat(List<ChatLine> lines, String action) {
        return new Chat(lines, action, Map.of(), null, Chat.DEFAULT_MAX_LENGTH, null);
    }

    static Chat chat(List<ChatLine> lines) {
        return new Chat(lines, null, Map.of(), null, Chat.DEFAULT_MAX_LENGTH, null);
    }

    static IconBlock icon(Icon icon) {
        return new IconBlock(icon, null);
    }

    static IconBlock icon(Icon icon, String label) {
        return new IconBlock(icon, label);
    }

    /**
     * An image of the add-on's own: a PNG, JPEG, GIF or WebP file's bytes
     *
     * @param alt what it shows, read by screen readers; "" if it's only decoration
     */
    static Image image(byte[] bytes, String alt) {
        return new Image(Icon.dataUrl(bytes, Image.MAX_BYTES), alt, 0, false);
    }

    /** {@link #image(byte[], String)}, from base64 or a {@code data:image/…;base64,} URL */
    static Image image(String base64, String alt) {
        return image(Icon.decode(base64, Image.MAX_BYTES), alt);
    }

    /**
     * A top-down map of the world from ({@code minX}, {@code minZ}) to ({@code maxX}, {@code
     * maxZ}) (X to the right and Z down) with areas and markers the app draws over it
     */
    static MapBlock map(double minX, double minZ, double maxX, double maxZ) {
        return new MapBlock(minX, minZ, maxX, maxZ, null, List.of(), List.of());
    }

    static Tree tree(List<TreeNode> nodes) {
        return new Tree(nodes);
    }

    /** Groups blocks together, can't contain another card */
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

    /** Numbers side by side, such as "Deaths 12" */
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
     * @param icon shown at the start of the row instead of a player's face, or null
     */
    record ListItem(
            String title,
            String subtitle,
            String trailing,
            PlayerProfile player,
            Link link,
            Icon icon) {
        public ListItem {
            Objects.requireNonNull(title, "title");
        }

        public ListItem(
                String title, String subtitle, String trailing, PlayerProfile player, Link link) {
            this(title, subtitle, trailing, player, link, null);
        }

        public static ListItem of(String title) {
            return new ListItem(title, null, null, null, null, null);
        }

        public ListItem subtitle(String subtitle) {
            return new ListItem(title, subtitle, trailing, player, link, icon);
        }

        public ListItem trailing(String trailing) {
            return new ListItem(title, subtitle, trailing, player, link, icon);
        }

        public ListItem player(PlayerProfile player) {
            return new ListItem(title, subtitle, trailing, player, link, icon);
        }

        public ListItem link(Link link) {
            return new ListItem(title, subtitle, trailing, player, link, icon);
        }

        public ListItem icon(Icon icon) {
            return new ListItem(title, subtitle, trailing, player, link, icon);
        }

        JsonObject toJson() {
            JsonObject json = new JsonObject();
            json.addProperty("title", title);
            if (subtitle != null) json.addProperty("subtitle", subtitle);
            if (trailing != null) json.addProperty("trailing", trailing);
            if (player != null) json.add("player", playerJson(player));
            if (link != null) json.add("link", link.toJson());
            if (icon != null) json.addProperty("icon", icon.id());
            return json;
        }
    }

    /** A progress bar filled to {@code value / max} */
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

    /** A row of options each opening its own view */
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
     * Either calls {@code action} with {@code params}, or opens {@code link}
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

    /**
     * @param action called with what's written, or null for a chat that can only be read
     * @param placeholder shown in the empty box, or null
     * @param maxLength of what can be written, which the action must check too
     * @param empty shown instead of the lines when there are none, or null
     */
    record Chat(
            List<ChatLine> lines,
            String action,
            Map<String, String> params,
            String placeholder,
            int maxLength,
            String empty)
            implements Block {

        public static final String VALUE = "text";
        public static final int MAX_LINES = 200;
        public static final int DEFAULT_MAX_LENGTH = 256;

        public Chat {
            lines = List.copyOf(lines);
            if (lines.size() > MAX_LINES) {
                throw new IllegalArgumentException("A chat shows at most " + MAX_LINES + " lines");
            }
            if (action != null) Names.check(action, "action");
            params = Names.checkParams(params);
            if (maxLength < 1 || maxLength > Field.MAX_TEXT_LENGTH) {
                throw new IllegalArgumentException(
                        "maxLength must be between 1 and " + Field.MAX_TEXT_LENGTH);
            }
        }

        public Chat params(Map<String, String> params) {
            return new Chat(lines, action, params, placeholder, maxLength, empty);
        }

        public Chat placeholder(String placeholder) {
            return new Chat(lines, action, params, placeholder, maxLength, empty);
        }

        public Chat maxLength(int maxLength) {
            return new Chat(lines, action, params, placeholder, maxLength, empty);
        }

        public Chat empty(String text) {
            return new Chat(lines, action, params, placeholder, maxLength, text);
        }

        @Override
        public JsonObject toJson() {
            JsonObject json = typed("chat");
            JsonArray array = new JsonArray();
            lines.forEach(line -> array.add(line.toJson()));
            json.add("lines", array);
            if (action != null) {
                json.addProperty("action", action);
                if (!params.isEmpty()) json.add("params", Names.toJson(params));
                if (placeholder != null) json.addProperty("placeholder", placeholder);
                json.addProperty("maxLength", maxLength);
            }
            if (empty != null) json.addProperty("empty", empty);
            return json;
        }
    }

    /**
     * A line of a {@link Chat}: {@code [tag] <name> text}
     *
     * @param name who wrote it, or null for a line from the game such as "Steve joined the game",
     *     shown in yellow
     * @param tag before the name, in grey, such as "Phone", or null
     * @param time when, which the app shows in the phone's time zone, or null
     * @param player who wrote it, whose face players can choose to see instead of the name, or null
     * @param whisper whether it was for one player only, shown in grey italics as in the game
     */
    record ChatLine(
            String name,
            String text,
            String tag,
            Instant time,
            PlayerProfile player,
            boolean whisper) {
        public ChatLine {
            Objects.requireNonNull(text, "text");
        }

        public static ChatLine of(String name, String text) {
            return new ChatLine(
                    Objects.requireNonNull(name, "name"), text, null, null, null, false);
        }

        /** A line by {@code player} under their name */
        public static ChatLine of(PlayerProfile player, String text) {
            return of(player.name(), text).player(player);
        }

        /** A line from the game rather than a player */
        public static ChatLine system(String text) {
            return new ChatLine(null, text, null, null, null, false);
        }

        public ChatLine tag(String tag) {
            return new ChatLine(name, text, tag, time, player, whisper);
        }

        public ChatLine time(Instant time) {
            return new ChatLine(name, text, tag, time, player, whisper);
        }

        public ChatLine player(PlayerProfile player) {
            return new ChatLine(name, text, tag, time, player, whisper);
        }

        public ChatLine whispered() {
            return new ChatLine(name, text, tag, time, player, true);
        }

        JsonObject toJson() {
            JsonObject json = new JsonObject();
            if (name != null) json.addProperty("name", name);
            json.addProperty("text", text);
            if (tag != null) json.addProperty("tag", tag);
            if (time != null) json.addProperty("time", time.toEpochMilli());
            if (player != null) json.add("player", playerJson(player));
            if (whisper) json.addProperty("whisper", true);
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

    /**
     * @param nodes at most {@link #MAX_NODES}, each one's parent before it
     */
    record Tree(List<TreeNode> nodes) implements Block {
        public static final int MAX_NODES = 500;

        public Tree {
            nodes = List.copyOf(nodes);
            if (nodes.size() > MAX_NODES) {
                throw new IllegalArgumentException("A tree has at most " + MAX_NODES + " nodes");
            }
            Set<String> seen = new HashSet<>();
            for (TreeNode node : nodes) {
                if (node.parent() != null && !seen.contains(node.parent())) {
                    throw new IllegalArgumentException(
                            "Tree node "
                                    + node.id()
                                    + "'s parent "
                                    + node.parent()
                                    + " must come before it");
                }
                if (!seen.add(node.id())) {
                    throw new IllegalArgumentException("Two tree nodes have the ID " + node.id());
                }
            }
        }

        @Override
        public JsonObject toJson() {
            JsonObject json = typed("tree");
            JsonArray array = new JsonArray();
            nodes.forEach(node -> array.add(node.toJson()));
            json.add("nodes", array);
            return json;
        }
    }

    /**
     * @param id unique within its tree: 1 to {@link #MAX_ID_LENGTH} characters, any of them
     * @param parent the ID of the node it's under, or null for a top-level node
     * @param subtitle under the title, or null
     * @param trailing at the end of the row, such as a date, or null
     * @param state drawn as an icon: done, the next to do, or still out of reach
     * @param badge a short tag next to the title, such as "Challenge", or null
     * @param link what the node opens, or null
     * @param icon shown before the title, such as the item an advancement shows, or null
     */
    record TreeNode(
            String id,
            String parent,
            String title,
            String subtitle,
            String trailing,
            State state,
            String badge,
            Link link,
            Icon icon) {
        public static final int MAX_ID_LENGTH = 256;

        public enum State {
            NONE,
            DONE,
            AVAILABLE,
            LOCKED
        }

        public TreeNode {
            Objects.requireNonNull(id, "id");
            if (id.isEmpty() || id.length() > MAX_ID_LENGTH) {
                throw new IllegalArgumentException(
                        "A tree node's ID is 1 to " + MAX_ID_LENGTH + " characters");
            }
            if (id.equals(parent)) {
                throw new IllegalArgumentException("Tree node " + id + " is its own parent");
            }
            Objects.requireNonNull(title, "title");
            Objects.requireNonNull(state, "state");
        }

        public TreeNode(
                String id,
                String parent,
                String title,
                String subtitle,
                String trailing,
                State state,
                String badge,
                Link link) {
            this(id, parent, title, subtitle, trailing, state, badge, link, null);
        }

        public static TreeNode of(String id, String title) {
            return new TreeNode(id, null, title, null, null, State.NONE, null, null, null);
        }

        public static TreeNode of(String id, String parent, String title) {
            return new TreeNode(id, parent, title, null, null, State.NONE, null, null, null);
        }

        public TreeNode subtitle(String subtitle) {
            return new TreeNode(id, parent, title, subtitle, trailing, state, badge, link, icon);
        }

        public TreeNode trailing(String trailing) {
            return new TreeNode(id, parent, title, subtitle, trailing, state, badge, link, icon);
        }

        public TreeNode state(State state) {
            return new TreeNode(id, parent, title, subtitle, trailing, state, badge, link, icon);
        }

        public TreeNode badge(String badge) {
            return new TreeNode(id, parent, title, subtitle, trailing, state, badge, link, icon);
        }

        public TreeNode link(Link link) {
            return new TreeNode(id, parent, title, subtitle, trailing, state, badge, link, icon);
        }

        public TreeNode icon(Icon icon) {
            return new TreeNode(id, parent, title, subtitle, trailing, state, badge, link, icon);
        }

        JsonObject toJson() {
            JsonObject json = new JsonObject();
            json.addProperty("id", id);
            if (parent != null) json.addProperty("parent", parent);
            json.addProperty("title", title);
            if (subtitle != null) json.addProperty("subtitle", subtitle);
            if (trailing != null) json.addProperty("trailing", trailing);
            if (state != State.NONE) json.addProperty("state", Names.lower(state));
            if (badge != null) json.addProperty("badge", badge);
            if (link != null) json.add("link", link.toJson());
            if (icon != null) json.addProperty("icon", icon.id());
            return json;
        }
    }

    /**
     * @param icon a pixelarticons name or a small image
     * @param label next to the icon or null for the icon alone
     */
    record IconBlock(Icon icon, String label) implements Block {
        public IconBlock {
            Objects.requireNonNull(icon, "icon");
        }

        @Override
        public JsonObject toJson() {
            JsonObject json = typed("icon");
            json.addProperty("icon", icon.id());
            if (label != null) json.addProperty("label", label);
            return json;
        }
    }

    /**
     * Made with {@link Block#image(byte[], String)}
     *
     * @param src a {@code data:image/…;base64,} URL
     * @param alt what it shows, read by screen readers; "" if it's only decoration
     * @param width in CSS pixels, at most {@link #MAX_WIDTH}, or 0 for the image's own: never wider
     *     than the page
     * @param pixelated scaled up with crisp pixels, for pixel art such as textures
     */
    record Image(String src, String alt, int width, boolean pixelated) implements Block {
        public static final int MAX_BYTES = 64 * 1024;
        public static final int MAX_WIDTH = 1024;

        public Image {
            Objects.requireNonNull(src, "src");
            if (!src.startsWith("data:image/")) {
                throw new IllegalArgumentException("Make images with Block.image");
            }
            Objects.requireNonNull(alt, "alt");
            if (width < 0 || width > MAX_WIDTH) {
                throw new IllegalArgumentException(
                        "An image's width is 1 to " + MAX_WIDTH + ", or 0 for its own");
            }
        }

        public Image width(int width) {
            return new Image(src, alt, width, pixelated);
        }

        public Image pixelArt() {
            return new Image(src, alt, width, true);
        }

        @Override
        public JsonObject toJson() {
            JsonObject json = typed("image");
            json.addProperty("src", src);
            json.addProperty("alt", alt);
            if (width > 0) json.addProperty("width", width);
            if (pixelated) json.addProperty("pixelated", true);
            return json;
        }
    }

    /**
     * Made with {@link Block#map}. Coordinates are world positions, not block numbers: the block at
     * x = 10 spans 10 to 11, so a map of blocks 0 to 15 is {@code map(0, 0, 16, 16)}. Use {@link
     * MapArea#blocks} and {@link MapMarker#atBlock} to mark blocks.
     *
     * @param background a {@code data:image/…;base64,} URL stretched over the whole map with crisp
     *     pixels, or null
     */
    record MapBlock(
            double minX,
            double minZ,
            double maxX,
            double maxZ,
            String background,
            List<MapArea> areas,
            List<MapMarker> markers)
            implements Block {

        public static final int MAX_AREAS = 500;
        public static final int MAX_MARKERS = 500;
        public static final int MAX_IMAGE_CHARS = 256 * 1024;

        public MapBlock {
            for (double d : new double[] {minX, minZ, maxX, maxZ}) {
                if (!Double.isFinite(d)) {
                    throw new IllegalArgumentException("A map's bounds are finite");
                }
            }
            if (minX >= maxX || minZ >= maxZ) {
                throw new IllegalArgumentException("A map's min corner is before its max corner");
            }
            if (background != null && !background.startsWith("data:image/")) {
                throw new IllegalArgumentException("Set a map's background with background(bytes)");
            }
            areas = List.copyOf(areas);
            if (areas.size() > MAX_AREAS) {
                throw new IllegalArgumentException("A map has at most " + MAX_AREAS + " areas");
            }
            markers = List.copyOf(markers);
            if (markers.size() > MAX_MARKERS) {
                throw new IllegalArgumentException("A map has at most " + MAX_MARKERS + " markers");
            }
            long images = background == null ? 0 : background.length();
            for (MapMarker marker : markers) {
                if (marker.icon() != null && marker.icon().isImage()) {
                    images += marker.icon().id().length();
                }
            }
            if (images > MAX_IMAGE_CHARS) {
                throw new IllegalArgumentException(
                        "A map's background and image icons are at most "
                                + MAX_IMAGE_CHARS
                                + " characters of base64 together, not "
                                + images
                                + ": use smaller images or named icons");
            }
        }

        /**
         * A PNG, JPEG, GIF or WebP of at most {@link Image#MAX_BYTES}
         */
        public MapBlock background(byte[] bytes) {
            return new MapBlock(
                    minX, minZ, maxX, maxZ, Icon.dataUrl(bytes, Image.MAX_BYTES), areas, markers);
        }

        public MapBlock background(String base64) {
            return background(Icon.decode(base64, Image.MAX_BYTES));
        }

        public MapBlock areas(List<MapArea> areas) {
            return new MapBlock(minX, minZ, maxX, maxZ, background, areas, markers);
        }

        public MapBlock markers(List<MapMarker> markers) {
            return new MapBlock(minX, minZ, maxX, maxZ, background, areas, markers);
        }

        @Override
        public JsonObject toJson() {
            JsonObject json = typed("map");
            json.addProperty("minX", minX);
            json.addProperty("minZ", minZ);
            json.addProperty("maxX", maxX);
            json.addProperty("maxZ", maxZ);
            if (background != null) json.addProperty("background", background);
            if (!areas.isEmpty()) {
                JsonArray array = new JsonArray();
                areas.forEach(area -> array.add(area.toJson()));
                json.add("areas", array);
            }
            if (!markers.isEmpty()) {
                JsonArray array = new JsonArray();
                markers.forEach(marker -> array.add(marker.toJson()));
                json.add("markers", array);
            }
            return json;
        }
    }

    /**
     * An outlined rectangle on a {@link MapBlock}, between world positions like the map's bounds.
     * Use {@link #blocks} to cover whole blocks.
     */
    record MapArea(double minX, double minZ, double maxX, double maxZ) {
        public MapArea {
            for (double d : new double[] {minX, minZ, maxX, maxZ}) {
                if (!Double.isFinite(d)) {
                    throw new IllegalArgumentException("An area's corners are finite");
                }
            }
            if (minX >= maxX || minZ >= maxZ) {
                throw new IllegalArgumentException(
                        "An area has a width and a height: use MapArea.blocks for single blocks");
            }
        }

        public static MapArea of(double x1, double z1, double x2, double z2) {
            return new MapArea(
                    Math.min(x1, x2), Math.min(z1, z2), Math.max(x1, x2), Math.max(z1, z2));
        }

        public static MapArea blocks(int x1, int z1, int x2, int z2) {
            return new MapArea(
                    Math.min(x1, x2),
                    Math.min(z1, z2),
                    Math.max(x1, x2) + 1.0,
                    Math.max(z1, z2) + 1.0);
        }

        JsonObject toJson() {
            JsonObject json = new JsonObject();
            json.addProperty("minX", minX);
            json.addProperty("minZ", minZ);
            json.addProperty("maxX", maxX);
            json.addProperty("maxZ", maxZ);
            return json;
        }
    }

    /**
     * A point on a {@link MapBlock}
     *
     * @param label what the marker is, never blank: also read by screen readers
     * @param icon a pixelarticons name or a small image such as a face, or null for a dot
     * @param link opened from the label, or null
     */
    record MapMarker(double x, double z, String label, Icon icon, Link link) {
        public MapMarker {
            if (!Double.isFinite(x) || !Double.isFinite(z)) {
                throw new IllegalArgumentException("A marker's position is finite");
            }
            Objects.requireNonNull(label, "label");
            if (label.isBlank()) {
                throw new IllegalArgumentException("A marker has a label");
            }
        }

        public static MapMarker of(double x, double z, String label) {
            return new MapMarker(x, z, label, null, null);
        }

        public static MapMarker atBlock(int x, int z, String label) {
            return new MapMarker(x + 0.5, z + 0.5, label, null, null);
        }

        public MapMarker icon(Icon icon) {
            return new MapMarker(x, z, label, icon, link);
        }

        public MapMarker link(Link link) {
            return new MapMarker(x, z, label, icon, link);
        }

        JsonObject toJson() {
            JsonObject json = new JsonObject();
            json.addProperty("x", x);
            json.addProperty("z", z);
            json.addProperty("label", label);
            if (icon != null) json.addProperty("icon", icon.id());
            if (link != null) json.add("link", link.toJson());
            return json;
        }
    }

    private static JsonObject playerJson(PlayerProfile player) {
        JsonObject json = new JsonObject();
        json.addProperty("uuid", player.id().toString());
        json.addProperty("name", player.name());
        if (player.skinUrl() != null) json.addProperty("skinUrl", player.skinUrl());
        return json;
    }

    private static JsonObject typed(String type) {
        JsonObject json = new JsonObject();
        json.addProperty("type", type);
        return json;
    }
}
