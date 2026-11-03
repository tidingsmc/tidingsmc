package dev.tidings.core.addon;

import java.lang.ref.ReferenceQueue;
import java.lang.ref.WeakReference;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * An image of an add-on's own, made by {@link Icon#image} and {@link Block#image}. Views carry
 * {@link #ref()} instead of the bytes: the app fetches each image once by its hash at {@code GET
 * /api/images/<hash>} and keeps it, so a page that refreshes doesn't resend its images
 *
 * <p>Images stay available while something holds them, and the most recent ones for a while
 * after, so the app can fetch the images of a view built for one request
 */
public final class ImageData {
    /** How many bytes of images no longer held stay available */
    static final long RECENT_BYTES = 32L * 1024 * 1024;

    /** How long an image no longer held stays available after it's last made or fetched */
    static final long RECENT_NANOS = TimeUnit.MINUTES.toNanos(10);

    private static final Pattern HASH = Pattern.compile("[A-Za-z0-9_-]{22}");

    private final String hash;
    private final String type;
    private final byte[] bytes;

    private ImageData(String hash, String type, byte[] bytes) {
        this.hash = hash;
        this.type = type;
        this.bytes = bytes;
    }

    /**
     * A PNG, JPEG, GIF or WebP of at most {@code max} bytes
     *
     * @throws IllegalArgumentException if it's another format or bigger
     */
    static ImageData of(byte[] bytes, int max) {
        Objects.requireNonNull(bytes, "bytes");
        if (bytes.length > max) {
            throw new IllegalArgumentException(
                    "An image is at most " + max + " bytes, not " + bytes.length);
        }
        String type = type(bytes);
        if (type == null) {
            throw new IllegalArgumentException("An image is a PNG, JPEG, GIF or WebP");
        }
        return keep(new ImageData(hash(bytes), type, bytes.clone()));
    }

    /** {@link #of(byte[], int)} from base64 or a {@code data:…;base64,} URL */
    static ImageData of(String base64, int max) {
        return of(decode(base64, max), max);
    }

    /** The image with this hash, if it's still available */
    public static Optional<ImageData> find(String hash) {
        if (hash == null || !HASH.matcher(hash).matches()) return Optional.empty();
        synchronized (ImageData.class) {
            sweep();
            Recent known = recent.get(hash);
            ImageData image = known == null ? null : known.image;
            if (image == null) {
                Held ref = held.get(hash);
                image = ref == null ? null : ref.get();
            }
            if (image != null) remember(image);
            return Optional.ofNullable(image);
        }
    }

    /** What views carry instead of the bytes: {@code image:<hash>} */
    public String ref() {
        return "image:" + hash;
    }

    /** 128 bits of the SHA-256 of the bytes, in base64url */
    public String hash() {
        return hash;
    }

    /** {@code image/png}, {@code image/jpeg}, {@code image/gif} or {@code image/webp} */
    public String type() {
        return type;
    }

    public int size() {
        return bytes.length;
    }

    public String base64() {
        return Base64.getEncoder().encodeToString(bytes);
    }

    /** {@code data:<type>;base64,…}, for what older apps read */
    public String dataUrl() {
        return "data:" + type + ";base64," + base64();
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof ImageData image && image.hash.equals(hash);
    }

    @Override
    public int hashCode() {
        return hash.hashCode();
    }

    @Override
    public String toString() {
        return "ImageData[" + type + ", " + bytes.length + " bytes, " + hash + "]";
    }

    // Every image something holds, by hash
    private static final Map<String, Held> held = new HashMap<>();
    private static final ReferenceQueue<ImageData> released = new ReferenceQueue<>();
    // The latest images made or fetched, oldest first, held for a while
    private static final LinkedHashMap<String, Recent> recent = new LinkedHashMap<>(16, 0.75f, true);
    private static long recentBytes;

    private record Recent(ImageData image, long at) {}

    private static final class Held extends WeakReference<ImageData> {
        final String hash;

        Held(ImageData image) {
            super(image, released);
            hash = image.hash;
        }
    }

    /** The image already known with the same bytes, or this one */
    private static synchronized ImageData keep(ImageData image) {
        sweep();
        Held ref = held.get(image.hash);
        ImageData known = ref == null ? null : ref.get();
        if (known != null && Arrays.equals(known.bytes, image.bytes)) {
            image = known;
        } else {
            held.put(image.hash, new Held(image));
        }
        remember(image);
        return image;
    }

    private static void remember(ImageData image) {
        long now = System.nanoTime();
        if (recent.put(image.hash, new Recent(image, now)) == null) {
            recentBytes += image.bytes.length;
        }
        Iterator<Recent> oldest = recent.values().iterator();
        while (oldest.hasNext()) {
            Recent next = oldest.next();
            if (recentBytes <= RECENT_BYTES && now - next.at < RECENT_NANOS) break;
            recentBytes -= next.image.bytes.length;
            oldest.remove();
        }
    }

    private static void sweep() {
        for (Object ref; (ref = released.poll()) != null; ) {
            Held gone = (Held) ref;
            held.remove(gone.hash, gone);
        }
    }

    /** Forgets recent images, so only held ones stay available. For tests */
    static synchronized void forgetRecent() {
        recent.clear();
        recentBytes = 0;
    }

    private static String hash(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(Arrays.copyOf(digest, 16));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("Every JVM has SHA-256", e);
        }
    }

    /** Base64, or a {@code data:…;base64,} URL, of at most {@code max} bytes once decoded */
    static byte[] decode(String base64, int max) {
        Objects.requireNonNull(base64, "base64");
        String data = base64.strip();
        if (data.startsWith("data:")) {
            int comma = data.indexOf(',');
            if (comma < 0 || !data.substring(0, comma).endsWith(";base64")) {
                throw new IllegalArgumentException("An image's data URL must be base64");
            }
            data = data.substring(comma + 1);
        }
        if (data.length() > (max + 2) / 3 * 4 + 4) {
            throw new IllegalArgumentException("An image is at most " + max + " bytes");
        }
        try {
            return Base64.getMimeDecoder().decode(data);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("An image isn't valid base64", e);
        }
    }

    private static String type(byte[] b) {
        if (starts(b, 0, 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A)) return "image/png";
        if (starts(b, 0, 0xFF, 0xD8, 0xFF)) return "image/jpeg";
        if (starts(b, 0, 'G', 'I', 'F', '8')) return "image/gif";
        if (starts(b, 0, 'R', 'I', 'F', 'F') && starts(b, 8, 'W', 'E', 'B', 'P')) {
            return "image/webp";
        }
        return null;
    }

    private static boolean starts(byte[] bytes, int offset, int... expected) {
        if (bytes.length < offset + expected.length) return false;
        for (int i = 0; i < expected.length; i++) {
            if ((bytes[offset + i] & 0xFF) != expected[i]) return false;
        }
        return true;
    }
}
