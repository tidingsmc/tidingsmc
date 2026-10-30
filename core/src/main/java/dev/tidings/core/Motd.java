package dev.tidings.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Turns a server description with legacy "§" codes into the segments the app renders. */
public final class Motd {
    private static final String COLORS =
            "black dark_blue dark_green dark_aqua dark_red dark_purple gold gray dark_gray blue"
                    + " green aqua red light_purple yellow white";
    private static final String[] COLOR_NAMES = COLORS.split(" ");

    private Motd() {}

    /** Mirrors the app's MotdSegment, null color and false flags are left out of the JSON. */
    public record Segment(
            String text,
            String color,
            boolean bold,
            boolean italic,
            boolean underlined,
            boolean strikethrough) {

        boolean sameStyle(Segment other) {
            return Objects.equals(color, other.color)
                    && bold == other.bold
                    && italic == other.italic
                    && underlined == other.underlined
                    && strikethrough == other.strikethrough;
        }
    }

    public static List<Segment> parse(String legacy) {
        List<Segment> segments = new ArrayList<>();
        Segment style = new Segment("", null, false, false, false, false);
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < legacy.length(); i++) {
            char c = legacy.charAt(i);
            if (c != '§') {
                text.append(c);
                continue;
            }
            if (i + 1 == legacy.length()) break; // a lone "§" at the end: Minecraft drops it
            char code = Character.toLowerCase(legacy.charAt(++i));
            Segment next = applyCode(style, code);
            if (next == null) continue; // unknown code: Minecraft drops it too
            add(segments, style, text);
            style = next;
        }
        add(segments, style, text);
        return segments;
    }

    /** The style after a "§" code, or null if the code means nothing. */
    private static Segment applyCode(Segment s, char code) {
        int color = "0123456789abcdef".indexOf(code);
        // Like Minecraft, a color also clears bold, italic and so on.
        if (color >= 0) return new Segment("", COLOR_NAMES[color], false, false, false, false);
        return switch (code) {
            case 'l' -> new Segment("", s.color, true, s.italic, s.underlined, s.strikethrough);
            case 'o' -> new Segment("", s.color, s.bold, true, s.underlined, s.strikethrough);
            case 'n' -> new Segment("", s.color, s.bold, s.italic, true, s.strikethrough);
            case 'm' -> new Segment("", s.color, s.bold, s.italic, s.underlined, true);
            case 'r' -> new Segment("", null, false, false, false, false);
            // Obfuscated: the app has no way to show it, keep the text plain.
            case 'k' -> s;
            default -> null;
        };
    }

    private static void add(List<Segment> segments, Segment style, StringBuilder text) {
        if (text.isEmpty()) return;
        Segment last = segments.isEmpty() ? null : segments.get(segments.size() - 1);
        if (last != null && last.sameStyle(style)) {
            segments.set(
                    segments.size() - 1,
                    new Segment(
                            last.text + text,
                            style.color,
                            style.bold,
                            style.italic,
                            style.underlined,
                            style.strikethrough));
        } else {
            segments.add(
                    new Segment(
                            text.toString(),
                            style.color,
                            style.bold,
                            style.italic,
                            style.underlined,
                            style.strikethrough));
        }
        text.setLength(0);
    }
}
