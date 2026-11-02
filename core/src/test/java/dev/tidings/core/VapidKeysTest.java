package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

import java.math.BigInteger;
import java.util.Arrays;
import java.util.Base64;

class VapidKeysTest {
    @Test
    void applicationServerKeyIsAnUncompressedPoint() {
        VapidKeys keys = VapidKeys.generate();

        byte[] point = Base64.getUrlDecoder().decode(keys.applicationServerKey());

        assertEquals(65, point.length);
        assertEquals(4, point[0]);
        assertEquals(
                keys.publicKey().getW().getAffineX(),
                new BigInteger(1, Arrays.copyOfRange(point, 1, 33)));
        assertEquals(
                keys.publicKey().getW().getAffineY(),
                new BigInteger(1, Arrays.copyOfRange(point, 33, 65)));
    }

    /** About one key in 128 has a coordinate that fits in 31 bytes: it still takes 32 */
    @Test
    void padsShortCoordinates() {
        VapidKeys keys;
        do {
            keys = VapidKeys.generate();
        } while (keys.publicKey().getW().getAffineX().bitLength() > 248
                && keys.publicKey().getW().getAffineY().bitLength() > 248);

        byte[] point = Base64.getUrlDecoder().decode(keys.applicationServerKey());

        assertEquals(65, point.length);
        assertEquals(
                keys.publicKey().getW().getAffineX(),
                new BigInteger(1, Arrays.copyOfRange(point, 1, 33)));
        assertEquals(
                keys.publicKey().getW().getAffineY(),
                new BigInteger(1, Arrays.copyOfRange(point, 33, 65)));
    }

    @Test
    void survivesEncoding() {
        VapidKeys keys = VapidKeys.generate();

        VapidKeys decoded = VapidKeys.decode(keys.encodedPublicKey(), keys.encodedPrivateKey());

        assertEquals(keys, decoded);
    }
}
