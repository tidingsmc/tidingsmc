package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.jupiter.api.Test;

import java.math.BigInteger;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.ECPrivateKeySpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;

class WebPushTest {
    private static final Instant NOW = Instant.parse("2026-10-30T12:00:00Z");

    private static byte[] decode(String base64Url) {
        return Base64.getUrlDecoder().decode(base64Url);
    }

    private static PrivateKey privateKey(String base64Url) throws GeneralSecurityException {
        return KeyFactory.getInstance("EC")
                .generatePrivate(
                        new ECPrivateKeySpec(new BigInteger(1, decode(base64Url)), WebPush.p256()));
    }

    /** RFC 8291 appendix A */
    @Test
    void encryptsLikeTheRfcExample() throws GeneralSecurityException {
        KeyPair asKeys =
                new KeyPair(
                        WebPush.publicKey(
                                decode(
                                        "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8")),
                        privateKey("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"));

        byte[] body =
                WebPush.encrypt(
                        "When I grow up, I want to be a watermelon"
                                .getBytes(StandardCharsets.UTF_8),
                        decode(
                                "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
                        decode("BTBZMqHH6r4Tts7J_aSIgg"),
                        asKeys,
                        decode("DGv6ra1nlYgDCS1FRnbzlw"));

        assertArrayEquals(
                decode(
                        "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"),
                body);
    }

    @Test
    void refusesPayloadsPushServicesMayNot() {
        VapidKeys device = VapidKeys.generate();
        VapidKeys as = VapidKeys.generate();

        assertThrows(
                IllegalArgumentException.class,
                () ->
                        WebPush.encrypt(
                                new byte[WebPush.MAX_PAYLOAD + 1],
                                VapidKeys.uncompressed(device.publicKey()),
                                new byte[16],
                                new KeyPair(as.publicKey(), as.privateKey()),
                                new byte[16]));
    }

    @Test
    void refusesAPointOffTheCurve() {
        byte[] point = VapidKeys.uncompressed(VapidKeys.generate().publicKey());
        point[64] ^= 1;

        assertThrows(GeneralSecurityException.class, () -> WebPush.publicKey(point));
    }

    @Test
    void signsVapidTokens() throws GeneralSecurityException {
        VapidKeys keys = VapidKeys.generate();
        WebPush push =
                new WebPush(keys, "https://mc.example.com", Clock.fixed(NOW, ZoneOffset.UTC));

        String[] parts = push.jwt("https://fcm.googleapis.com").split("\\.");

        assertEquals(3, parts.length);
        JsonObject header = JsonParser.parseString(new String(decode(parts[0]))).getAsJsonObject();
        assertEquals("ES256", header.get("alg").getAsString());
        JsonObject claims = JsonParser.parseString(new String(decode(parts[1]))).getAsJsonObject();
        assertEquals("https://fcm.googleapis.com", claims.get("aud").getAsString());
        assertEquals("https://mc.example.com", claims.get("sub").getAsString());
        assertEquals(
                NOW.plus(Duration.ofHours(12)).getEpochSecond(), claims.get("exp").getAsLong());

        byte[] signature = decode(parts[2]);
        assertEquals(64, signature.length, "JWTs want r and s, not DER");
        Signature es256 = Signature.getInstance("SHA256withECDSAinP1363Format");
        es256.initVerify(keys.publicKey());
        es256.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        assertTrue(es256.verify(signature));
        push.close();
    }

    @Test
    void addressesTokensToThePushServicesOrigin() {
        assertEquals(
                "https://push.example", WebPush.audience(URI.create("https://push.example/abc")));
        assertEquals(
                "https://push.example",
                WebPush.audience(URI.create("https://push.example:443/abc")));
        assertEquals(
                "https://push.example:8443",
                WebPush.audience(URI.create("https://push.example:8443/abc")));
    }

    @Test
    void tellsGoneSubscriptionsFromFailures() {
        assertEquals(PushSender.Result.DELIVERED, WebPush.resultOf(201));
        assertEquals(PushSender.Result.GONE, WebPush.resultOf(404));
        assertEquals(PushSender.Result.GONE, WebPush.resultOf(410));
        assertEquals(PushSender.Result.FAILED, WebPush.resultOf(403));
        assertEquals(PushSender.Result.FAILED, WebPush.resultOf(429));
        assertEquals(PushSender.Result.FAILED, WebPush.resultOf(503));
    }
}
