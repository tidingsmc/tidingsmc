package dev.tidings.core;

import java.math.BigInteger;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

public record VapidKeys(ECPublicKey publicKey, ECPrivateKey privateKey) {

    public static VapidKeys generate() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"));
            KeyPair pair = generator.generateKeyPair();
            return new VapidKeys((ECPublicKey) pair.getPublic(), (ECPrivateKey) pair.getPrivate());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Every JVM has P-256", e);
        }
    }

    public static VapidKeys decode(String publicKey, String privateKey) {
        try {
            KeyFactory factory = KeyFactory.getInstance("EC");
            Base64.Decoder base64 = Base64.getDecoder();
            return new VapidKeys(
                    (ECPublicKey)
                            factory.generatePublic(
                                    new X509EncodedKeySpec(base64.decode(publicKey))),
                    (ECPrivateKey)
                            factory.generatePrivate(
                                    new PKCS8EncodedKeySpec(base64.decode(privateKey))));
        } catch (GeneralSecurityException | IllegalArgumentException | ClassCastException e) {
            throw new IllegalArgumentException("Invalid VAPID keys", e);
        }
    }

    public String encodedPublicKey() {
        return Base64.getEncoder().encodeToString(publicKey.getEncoded());
    }

    public String encodedPrivateKey() {
        return Base64.getEncoder().encodeToString(privateKey.getEncoded());
    }

    public String applicationServerKey() {
        byte[] point = new byte[65];
        point[0] = 4;
        copyUnsigned(publicKey.getW().getAffineX(), point, 1);
        copyUnsigned(publicKey.getW().getAffineY(), point, 33);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(point);
    }

    private static void copyUnsigned(BigInteger value, byte[] target, int offset) {
        byte[] bytes = value.toByteArray();
        int length = Math.min(bytes.length, 32);
        System.arraycopy(bytes, bytes.length - length, target, offset + 32 - length, length);
    }
}
