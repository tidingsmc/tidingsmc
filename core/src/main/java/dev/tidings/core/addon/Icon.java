package dev.tidings.core.addon;

import java.util.Base64;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * An icon the app draws for an add-on. Either one of <a href="https://pixelarticons.com">pixelarticons</a>
 * by name (drawn in the app's colors) or a small image of the add-on's own
 */
public final class Icon {
    public static final int MAX_IMAGE_BYTES = 16 * 1024;

    private static final Pattern NAME = Pattern.compile("[a-z0-9]+(-[a-z0-9]+)*");
    private static final int MAX_NAME_LENGTH = 64;

    public static final Icon DEFAULT = named("default");
    public static final Icon CHART = named("chart");
    public static final Icon TROPHY = named("trophy");
    public static final Icon MAP = named("map");
    public static final Icon BOOK = named("book");
    public static final Icon STORE = named("store");
    public static final Icon COINS = named("coins");
    public static final Icon GIFT = named("gift");
    public static final Icon CALENDAR = named("calendar");
    public static final Icon FLAG = named("flag");
    public static final Icon MAIL = named("mail");
    public static final Icon MESSAGE = named("message");
    public static final Icon STAR = named("star");
    public static final Icon HEART = named("heart");
    public static final Icon SWORD = named("sword");
    public static final Icon SHIELD = named("shield");
    public static final Icon CROWN = named("crown");
    public static final Icon SERVER = named("server");
    public static final Icon GAMEPAD = named("gamepad");
    public static final Icon LIGHTBULB = named("lightbulb");
    public static final Icon SLIDERS = named("sliders");

    private final String id;

    private Icon(String id) {
        this.id = id;
    }

    /**
     * One of pixelarticons by its name on pixelarticons.com, such as {@code "trophy"} or {@code
     * "arrow-right"}. The app draws {@link #DEFAULT} for one it doesn't have
     *
     * @throws IllegalArgumentException if it isn't lowercase words joined by "-"
     */
    public static Icon named(String name) {
        Objects.requireNonNull(name, "name");
        if (name.length() > MAX_NAME_LENGTH || !NAME.matcher(name).matches()) {
            throw new IllegalArgumentException(
                    "Invalid icon name \"" + name + "\": use pixelarticons' names, like arrow-right");
        }
        return new Icon(name);
    }

    /**
     * An image of the add-on's own: a PNG, JPEG, GIF or WebP file's bytes. Small images are drawn
     * with crisp pixels, so a 16×16 texture works as is
     *
     * @throws IllegalArgumentException if it's another format, or bigger than {@link
     *     #MAX_IMAGE_BYTES}
     */
    public static Icon image(byte[] bytes) {
        return new Icon(dataUrl(bytes, MAX_IMAGE_BYTES));
    }

    /**
     * {@link #image(byte[])}, from base64 or a {@code data:image/…;base64,} URL
     *
     * @throws IllegalArgumentException if it isn't base64, or isn't a fitting image
     */
    public static Icon image(String base64) {
        return image(decode(base64, MAX_IMAGE_BYTES));
    }

    /** A PNG, JPEG, GIF or WebP of at most {@code max} bytes, as a data URL */
    static String dataUrl(byte[] bytes, int max) {
        Objects.requireNonNull(bytes, "bytes");
        if (bytes.length > max) {
            throw new IllegalArgumentException(
                    "An image is at most " + max + " bytes, not " + bytes.length);
        }
        String type = type(bytes);
        if (type == null) {
            throw new IllegalArgumentException("An image is a PNG, JPEG, GIF or WebP");
        }
        return "data:" + type + ";base64," + Base64.getEncoder().encodeToString(bytes);
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

    public boolean isImage() {
        return id.startsWith("data:");
    }

    public String id() {
        return id;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof Icon icon && icon.id.equals(id);
    }

    @Override
    public int hashCode() {
        return id.hashCode();
    }

    @Override
    public String toString() {
        return isImage() ? "Icon[image, " + id.length() + " chars]" : "Icon[" + id + "]";
    }
}
