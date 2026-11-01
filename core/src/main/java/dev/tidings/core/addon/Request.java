package dev.tidings.core.addon;

import dev.tidings.core.PlayerProfile;

import java.util.Map;

/**
 * What the app asks an add-on for.
 *
 * @param player the player whose device asks: Tidings checked its token. The add-on decides what
 *     they may see and do.
 * @param name the view or action
 * @param params from the {@link Link}, {@link Block.Button} or {@link Block.Form}: they come from
 *     the app, so check them like any input
 * @param values what the player filled in a {@link Block.Form}, by field name; empty otherwise.
 *     They come from the app too: Tidings only limits them to 1000 characters, not to the field's
 *     {@code maxLength} or a select's options, so check them like any input
 * @param locale the app's language, such as "en" or "fr"
 */
public record Request(
        PlayerProfile player,
        String name,
        Map<String, String> params,
        Map<String, String> values,
        String locale) {
    public Request {
        params = Map.copyOf(params);
        values = Map.copyOf(values);
    }

    /**
     * @throws AddonError if it's missing
     */
    public String param(String name) {
        String value = params.get(name);
        if (value == null) throw new AddonError("Missing " + name);
        return value;
    }

    public String param(String name, String fallback) {
        return params.getOrDefault(name, fallback);
    }

    /**
     * @throws AddonError if it's missing
     */
    public String value(String name) {
        String value = values.get(name);
        if (value == null) throw new AddonError("Missing " + name);
        return value;
    }
}
