package dev.tidings.core.addon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Optional;

import org.junit.jupiter.api.Test;

class ImageDataTest {
    private static byte[] gif(int size, int seed) {
        byte[] bytes = new byte[size];
        System.arraycopy("GIF89a".getBytes(), 0, bytes, 0, 6);
        for (int i = 6; i < size; i++) bytes[i] = (byte) (seed * 31 + i);
        return bytes;
    }

    @Test
    void viewsCarryAHashOfTheBytes() {
        Icon icon = Icon.image("GIF89a".getBytes());
        assertEquals("image:YQ9a5NduMyY2oXvTV_1s6Q", icon.id());
        assertEquals(icon, Icon.image("R0lGODlh"));
        assertEquals(icon, Icon.image("data:image/gif;base64,R0lGODlh"));
        assertEquals("image/gif", icon.image().type());
        assertEquals("R0lGODlh", icon.image().base64());
    }

    @Test
    void theSameBytesAreKeptOnce() {
        byte[] bytes = gif(100, 1);
        assertSame(Icon.image(bytes).image(), Block.image(bytes, "").image());
    }

    @Test
    void imagesCanBeFoundByTheirHash() {
        ImageData image = Icon.image(gif(100, 2)).image();
        assertSame(image, ImageData.find(image.hash()).orElseThrow());
        assertEquals(Optional.empty(), ImageData.find("AAAAAAAAAAAAAAAAAAAAAA"));
        assertEquals(Optional.empty(), ImageData.find("../etc/passwd"));
        assertEquals(Optional.empty(), ImageData.find(null));
    }

    @Test
    void heldImagesStayAvailable() {
        ImageData image = Icon.image(gif(100, 3)).image();
        ImageData.forgetRecent();
        assertTrue(ImageData.find(image.hash()).isPresent());
    }

    @Test
    void recentImagesStayAvailableForAWhile() {
        String first = Block.image(gif(Block.Image.MAX_BYTES, 4), "").image().hash();
        System.gc();
        assertTrue(ImageData.find(first).isPresent());
    }
}
