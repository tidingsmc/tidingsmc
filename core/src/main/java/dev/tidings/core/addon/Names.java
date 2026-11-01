package dev.tidings.core.addon;

import com.google.gson.JsonObject;

import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

/** Checks for the names add-ons choose: of views, actions, params and fields. */
final class Names {
    private static final Pattern NAME = Pattern.compile("[A-Za-z0-9_-]{1,64}");

    /** What the app's routes and {@link Addons} accept for each param. */
    static final int MAX_PARAMS = 16;

    static final int MAX_PARAM_LENGTH = 256;

    private Names() {}

    static String check(String name, String what) {
        Objects.requireNonNull(name, what);
        if (!NAME.matcher(name).matches()) {
            throw new IllegalArgumentException(
                    "Invalid " + what + " name \"" + name + "\": use 1 to 64 of A-Z a-z 0-9 _ -");
        }
        return name;
    }

    static Map<String, String> checkParams(Map<String, String> params) {
        if (params.size() > MAX_PARAMS) {
            throw new IllegalArgumentException("At most " + MAX_PARAMS + " params");
        }
        params.forEach(
                (name, value) -> {
                    check(name, "param");
                    Objects.requireNonNull(value, name);
                    if (value.length() > MAX_PARAM_LENGTH) {
                        throw new IllegalArgumentException(
                                "Param " + name + " is over " + MAX_PARAM_LENGTH + " characters");
                    }
                });
        return Map.copyOf(params);
    }

    static JsonObject toJson(Map<String, String> params) {
        JsonObject json = new JsonObject();
        params.forEach(json::addProperty);
        return json;
    }

    static String lower(Enum<?> value) {
        return value.name().toLowerCase(Locale.ROOT);
    }
}
