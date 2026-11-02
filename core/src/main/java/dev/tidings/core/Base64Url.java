package dev.tidings.core;

import java.util.Base64;

final class Base64Url {
    private Base64Url() {}

    static String encode(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /**
     * @throws IllegalArgumentException if {@code base64Url} isn't valid base64url
     */
    static byte[] decode(String base64Url) {
        return Base64.getUrlDecoder().decode(base64Url);
    }
}
