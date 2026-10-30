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
        return Base64Url.encode(uncompressed(publicKey));
    }

    /** {@code key} as Web Push writes P-256 public keys: 0x04, then X and Y on 32 bytes each. */
    static byte[] uncompressed(ECPublicKey key) {
        byte[] point = new byte[65];
        point[0] = 4;
        copyUnsigned(key.getW().getAffineX(), point, 1);
        copyUnsigned(key.getW().getAffineY(), point, 33);
        return point;
    }

    private static void copyUnsigned(BigInteger value, byte[] target, int offset) {
        byte[] bytes = value.toByteArray();
        int length = Math.min(bytes.length, 32);
        System.arraycopy(bytes, bytes.length - length, target, offset + 32 - length, length);
    }
}
