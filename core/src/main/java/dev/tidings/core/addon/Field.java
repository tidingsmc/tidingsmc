package dev.tidings.core.addon;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.List;
import java.util.Objects;

/**
 * Something the player fills in, in a {@link Block.Form}. What they chose reaches the action as
 * text, by {@link #name}: a toggle's as "true" or "false"
 */
public sealed interface Field permits Field.TextField, Field.Toggle, Field.Select {
    String name();

    JsonObject toJson();

    static TextField text(String name, String label) {
        return new TextField(name, label, "", null, MAX_TEXT_LENGTH);
    }

    static Toggle toggle(String name, String label, boolean value) {
        return new Toggle(name, label, value);
    }

    /** {@code value}: the option chosen at first */
    static Select select(String name, String label, List<Option> options, String value) {
        return new Select(name, label, options, value);
    }

    /** What the app lets players type at most, and what {@link Addons} accepts */
    int MAX_TEXT_LENGTH = 1000;

    /**
     * @param placeholder shown while it's empty, or null
     */
    record TextField(String name, String label, String value, String placeholder, int maxLength)
            implements Field {
        public TextField {
            Names.check(name, "field");
            Objects.requireNonNull(label, "label");
            Objects.requireNonNull(value, "value");
            if (maxLength < 1 || maxLength > MAX_TEXT_LENGTH) {
                throw new IllegalArgumentException(
                        "maxLength must be between 1 and " + MAX_TEXT_LENGTH);
            }
        }

        public TextField value(String value) {
            return new TextField(name, label, value, placeholder, maxLength);
        }

        public TextField placeholder(String placeholder) {
            return new TextField(name, label, value, placeholder, maxLength);
        }

        public TextField maxLength(int maxLength) {
            return new TextField(name, label, value, placeholder, maxLength);
        }

        @Override
        public JsonObject toJson() {
            JsonObject json = field("text", name, label);
            if (!value.isEmpty()) json.addProperty("value", value);
            if (placeholder != null) json.addProperty("placeholder", placeholder);
            json.addProperty("maxLength", maxLength);
            return json;
        }
    }

    record Toggle(String name, String label, boolean value) implements Field {
        public Toggle {
            Names.check(name, "field");
            Objects.requireNonNull(label, "label");
        }

        @Override
        public JsonObject toJson() {
            JsonObject json = field("toggle", name, label);
            json.addProperty("value", value);
            return json;
        }
    }

    record Select(String name, String label, List<Option> options, String value) implements Field {
        public Select {
            Names.check(name, "field");
            Objects.requireNonNull(label, "label");
            options = List.copyOf(options);
            if (options.isEmpty()) throw new IllegalArgumentException("A select needs options");
            String chosen = value;
            if (options.stream().noneMatch(o -> o.value().equals(chosen))) {
                throw new IllegalArgumentException("The chosen value isn't one of the options");
            }
        }

        @Override
        public JsonObject toJson() {
            JsonObject json = field("select", name, label);
            JsonArray array = new JsonArray();
            for (Option option : options) {
                JsonObject o = new JsonObject();
                o.addProperty("value", option.value());
                o.addProperty("label", option.label());
                array.add(o);
            }
            json.add("options", array);
            json.addProperty("value", value);
            return json;
        }
    }

    record Option(String value, String label) {
        public Option {
            Objects.requireNonNull(value, "value");
            Objects.requireNonNull(label, "label");
        }

        public static Option of(String value, String label) {
            return new Option(value, label);
        }
    }

    private static JsonObject field(String type, String name, String label) {
        JsonObject json = new JsonObject();
        json.addProperty("type", type);
        json.addProperty("name", name);
        json.addProperty("label", label);
        return json;
    }
}
