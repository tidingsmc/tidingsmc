package dev.tidings.core;

import java.net.URI;
import java.security.GeneralSecurityException;

/**
 * Where to send a device's notifications, as the browser's PushSubscription gives it
 *
 * @param p256dh the browser's public key for encrypting payloads, base64url
 * @param auth the browser's authentication secret, base64url
 */
public record PushSubscription(URI endpoint, String p256dh, String auth) {

    public PushSubscription {
        if (endpoint == null) throw new IllegalArgumentException("Missing push endpoint");
        if (!"https".equals(endpoint.getScheme()) || endpoint.getHost() == null) {
            throw new IllegalArgumentException("The push endpoint must be an HTTPS URL");
        }
        if (p256dh == null || p256dh.isEmpty() || auth == null || auth.isEmpty()) {
            throw new IllegalArgumentException("Missing push keys");
        }
        try {
            WebPush.publicKey(decode(p256dh, "p256dh"));
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException("Invalid push key p256dh", e);
        }
        if (decode(auth, "auth").length != 16) {
            throw new IllegalArgumentException("Invalid push key auth");
        }
    }

    public byte[] publicKey() {
        return decode(p256dh, "p256dh");
    }

    public byte[] authSecret() {
        return decode(auth, "auth");
    }

    private static byte[] decode(String base64Url, String what) {
        try {
            return Base64Url.decode(base64Url);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid push key " + what, e);
        }
    }
}
