package dev.tidings.core.addon;

import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.Test;

class IconTest {
    /** A 1×1 PNG */
    private static final byte[] PNG =
            Base64.getDecoder()
                    .decode(
                            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
                                    + "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");

    @Test
    void theOldOnesKeepTheirNames() {
        assertEquals("default", Icon.DEFAULT.id());
        assertEquals("trophy", Icon.TROPHY.id());
        assertEquals(Icon.TROPHY, Icon.named("trophy"));
        assertFalse(Icon.TROPHY.isImage());
    }

    @Test
    void anyPixelarticonsNameWorks() {
        assertEquals("arrow-right", Icon.named("arrow-right").id());
        assertEquals("ai-app-mac-sharp", Icon.named("ai-app-mac-sharp").id());
        String[] bad = {"", "Trophy", "arrow_right", "-x", "x-", "a--b", "../x", "x".repeat(65)};
        for (String name : bad) {
            assertThrows(IllegalArgumentException.class, () -> Icon.named(name), name);
        }
    }

    @Test
    void imagesBecomeDataUrls() {
        String base64 = Base64.getEncoder().encodeToString(PNG);
        Icon icon = Icon.image(PNG);
        assertTrue(icon.isImage());
        assertEquals("data:image/png;base64," + base64, icon.id());
        assertEquals(icon, Icon.image(base64));
        assertEquals(icon, Icon.image("data:image/png;base64," + base64));
        assertEquals(icon, Icon.image("data:image/gif;base64," + base64));
    }

    @Test
    void otherFormatsAreRecognized() {
        assertTrue(Icon.image(new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0}).id()
                .startsWith("data:image/jpeg;base64,"));
        assertTrue(Icon.image("GIF89a".getBytes()).id().startsWith("data:image/gif;base64,"));
        assertTrue(Icon.image("RIFF\0\0\0\0WEBPVP8 ".getBytes()).id()
                .startsWith("data:image/webp;base64,"));
    }

    @Test
    void imagesAreChecked() {
        assertThrows(IllegalArgumentException.class, () -> Icon.image("<svg/>".getBytes()));
        assertThrows(IllegalArgumentException.class, () -> Icon.image(new byte[0]));
        assertThrows(IllegalArgumentException.class, () -> Icon.image("not base64!"));
        assertThrows(IllegalArgumentException.class, () -> Icon.image("data:image/png,raw"));
        byte[] big = new byte[Icon.MAX_IMAGE_BYTES + 1];
        System.arraycopy(PNG, 0, big, 0, PNG.length);
        assertThrows(IllegalArgumentException.class, () -> Icon.image(big));
        assertThrows(
                IllegalArgumentException.class,
                () -> Icon.image(Base64.getEncoder().encodeToString(big)));
    }
}
