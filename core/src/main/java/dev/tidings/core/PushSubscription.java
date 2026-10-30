package dev.tidings.core;

import java.net.URI;

/**
 * Where to send a device's notifications, as the browser's PushSubscription gives it.
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
    }
}
