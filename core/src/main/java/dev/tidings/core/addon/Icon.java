package dev.tidings.core.addon;

import java.util.Locale;

/**
 * An add-on tab's icon, from the set the app draws. An app older than the add-on draws {@link
 * #DEFAULT} for names it doesn't know.
 */
public enum Icon {
    DEFAULT,
    CHART,
    TROPHY,
    MAP,
    BOOK,
    STORE,
    COINS,
    GIFT,
    CALENDAR,
    FLAG,
    MAIL,
    MESSAGE,
    STAR,
    HEART,
    SWORD,
    SHIELD,
    CROWN,
    SERVER,
    GAMEPAD,
    LIGHTBULB,
    SLIDERS;

    /** As in /api/info, such as {@code "trophy"}. */
    public String id() {
        return name().toLowerCase(Locale.ROOT);
    }
}
