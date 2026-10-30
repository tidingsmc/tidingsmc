package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

import java.util.Base64;

class VapidKeysTest {
    @Test
    void applicationServerKeyIsAnUncompressedPoint() {
        for (int i = 0; i < 20; i++) {
            byte[] point =
                    Base64.getUrlDecoder().decode(VapidKeys.generate().applicationServerKey());

            assertEquals(65, point.length);
            assertEquals(4, point[0]);
        }
    }

    @Test
    void survivesEncoding() {
        VapidKeys keys = VapidKeys.generate();

        VapidKeys decoded = VapidKeys.decode(keys.encodedPublicKey(), keys.encodedPrivateKey());

        assertEquals(keys, decoded);
    }
}
