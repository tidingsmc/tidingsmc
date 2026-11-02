package dev.tidings.core.addon;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * A tab other mods add to the app's page for this server. Mods register it through their loader's
 * Tidings entry point, which sets its ID to the mod's own, such as on Forge:
 *
 * <pre>{@code
 * TidingsAddons.register(
 *         context, // the one Forge gives the mod's constructor
 *         Addon.builder("My stats")
 *                 .icon(Icon.CHART)
 *                 .view("home", request -> View.of(null, Block.text("Hello " + request.player().name())))
 *                 .action("wave", request -> ActionResult.message("You waved")));
 * }</pre>
 *
 * Views and actions run on the server thread, one at a time like everything else in the game: keep
 * them quick, the app waits a few seconds at most.
 *
 * @param id the ID of the mod that registered it: stays the same across versions, and is unique on
 *     a server. 1 to 64 of a-z 0-9 _ -
 * @param title the tab's name, read by screen readers: the tab shows {@code icon}
 * @param icon the tab's icon
 * @param views by name, the first one being the tab's
 */
public record Addon(
        String id,
        String title,
        Icon icon,
        Map<String, Function<Request, View>> views,
        Map<String, Function<Request, ActionResult>> actions) {
    private static final Pattern ID = Pattern.compile("[a-z0-9_-]{1,64}");

    public Addon {
        Objects.requireNonNull(id, "id");
        if (!ID.matcher(id).matches()) {
            throw new IllegalArgumentException(
                    "Invalid add-on ID \"" + id + "\": use 1 to 64 of a-z 0-9 _ -");
        }
        Objects.requireNonNull(title, "title");
        Objects.requireNonNull(icon, "icon");
        views = Collections.unmodifiableMap(new LinkedHashMap<>(views));
        actions = Map.copyOf(actions);
        if (views.isEmpty()) throw new IllegalArgumentException("An add-on needs a view");
        views.keySet().forEach(name -> Names.check(name, "view"));
        actions.keySet().forEach(name -> Names.check(name, "action"));
    }

    public static Builder builder(String title) {
        return new Builder(title);
    }

    /** The view the tab opens on */
    public String firstView() {
        return views.keySet().iterator().next();
    }

    public static final class Builder {
        private final String title;
        private Icon icon = Icon.DEFAULT;
        private final Map<String, Function<Request, View>> views = new LinkedHashMap<>();
        private final Map<String, Function<Request, ActionResult>> actions = new LinkedHashMap<>();

        private Builder(String title) {
            this.title = title;
        }

        public Builder icon(Icon icon) {
            this.icon = Objects.requireNonNull(icon);
            return this;
        }

        public Builder view(String name, Function<Request, View> view) {
            if (views.putIfAbsent(name, Objects.requireNonNull(view)) != null) {
                throw new IllegalArgumentException("Two views named " + name);
            }
            return this;
        }

        public Builder action(String name, Function<Request, ActionResult> action) {
            if (actions.putIfAbsent(name, Objects.requireNonNull(action)) != null) {
                throw new IllegalArgumentException("Two actions named " + name);
            }
            return this;
        }

        public Addon build(String id) {
            return new Addon(id, title, icon, views, actions);
        }
    }
}
