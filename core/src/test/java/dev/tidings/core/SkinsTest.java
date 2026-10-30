package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

class SkinsTest {
    private static String encode(String json) {
        return Base64.getEncoder().encodeToString(json.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void readsTheSkinUrl() {
        String textures =
                encode(
                        "{\"profileName\":\"Steve\",\"textures\":{\"SKIN\":"
                                + "{\"url\":\"http://textures.minecraft.net/texture/abc\"}}}");

        assertEquals("http://textures.minecraft.net/texture/abc", Skins.skinUrl(textures));
    }

    @Test
    void nullWithoutASkin() {
        assertNull(Skins.skinUrl(null));
        assertNull(Skins.skinUrl(encode("{\"textures\":{}}")));
        assertNull(Skins.skinUrl("not base64!"));
    }
}
