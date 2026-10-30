package dev.tidings.core;

import com.google.gson.JsonElement;
import com.google.gson.JsonParser;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

public final class Skins {
    private Skins() {}

    /**
     * The skin URL in a game profile's "textures" property (base64 JSON from Mojang's session
     * server), or null if it has none.
     */
    public static String skinUrl(String texturesProperty) {
        if (texturesProperty == null) return null;
        try {
            String json =
                    new String(
                            Base64.getDecoder().decode(texturesProperty), StandardCharsets.UTF_8);
            JsonElement url =
                    JsonParser.parseString(json)
                            .getAsJsonObject()
                            .getAsJsonObject("textures")
                            .getAsJsonObject("SKIN")
                            .get("url");
            return url == null ? null : url.getAsString();
        } catch (RuntimeException e) {
            return null;
        }
    }
}
