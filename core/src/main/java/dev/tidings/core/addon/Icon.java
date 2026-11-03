package dev.tidings.core.addon;

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

    private final String name;
    private final ImageData image;

    private Icon(String name, ImageData image) {
        this.name = name;
        this.image = image;
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
        return new Icon(name, null);
    }

    /**
     * An image of the add-on's own: a PNG, JPEG, GIF or WebP file's bytes. Small images are drawn
     * with crisp pixels, so a 16×16 texture works as is. The app fetches it once and keeps it, see
     * {@link ImageData}
     *
     * @throws IllegalArgumentException if it's another format, or bigger than {@link
     *     #MAX_IMAGE_BYTES}
     */
    public static Icon image(byte[] bytes) {
        return new Icon(null, ImageData.of(bytes, MAX_IMAGE_BYTES));
    }

    /**
     * {@link #image(byte[])}, from base64 or a {@code data:image/…;base64,} URL
     *
     * @throws IllegalArgumentException if it isn't base64, or isn't a fitting image
     */
    public static Icon image(String base64) {
        return new Icon(null, ImageData.of(base64, MAX_IMAGE_BYTES));
    }

    public boolean isImage() {
        return image != null;
    }

    /** The image, or null for a named icon */
    public ImageData image() {
        return image;
    }

    /** What views carry: the name, or {@link ImageData#ref()} */
    public String id() {
        return image != null ? image.ref() : name;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof Icon icon && icon.id().equals(id());
    }

    @Override
    public int hashCode() {
        return id().hashCode();
    }

    @Override
    public String toString() {
        return isImage() ? "Icon[" + image + "]" : "Icon[" + name + "]";
    }
}
