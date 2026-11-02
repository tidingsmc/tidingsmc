package dev.tidings.core.addon;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import dev.tidings.core.PlayerProfile;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * The add-ons the app shows tabs for. Mods register theirs through their loader's entry point, such
 * as Forge's {@code TidingsAddons.register}, while the game loads
 *
 * <p>The app reaches them at {@code POST /api/addons/<id>/view} and {@code /action}, authenticated
 * like the rest of the API: add-ons never see device tokens
 */
public final class Addons {
    private static final Addons REGISTERED = new Addons();

    private static final AtomicBoolean REGISTRAR_TAKEN = new AtomicBoolean();

    private static final Pattern LOCALE = Pattern.compile("[A-Za-z0-9-]{1,35}");

    /**
     * By ID: mods load in parallel, so the order they register in changes from a start to another
     */
    private final Map<String, Addon> addons = new TreeMap<>();

    /** What the running Tidings offers add-ons; null while it isn't running */
    private volatile Host host;

    /**
     * More would be spam: what's over is dropped, see {@link AddonContext#notify}. Enough for a
     * burst of news, such as several players dying in the same fight
     */
    public static final int MAX_NOTIFICATIONS_PER_MINUTE = 10;

    /**
     * How the running Tidings serves {@link AddonContext}. Its methods may be called on any thread
     */
    public interface Host {
        void notify(String addonId, Notification notification);

        boolean isAnnounced(UUID player);

        Optional<PlayerProfile> knownPlayer(UUID player);
    }

    /** Thrown when the app asks for an add-on, view or action that doesn't exist (anymore) */
    public static final class NotFound extends RuntimeException {
        NotFound(String message) {
            super(message);
        }
    }

    /** For tests: the game uses {@link #registered} */
    public Addons() {}

    public static Addons registered() {
        return REGISTERED;
    }

    /**
     * For the loader's entry point, which sets each add-on's ID to its mod's, such as Forge's
     * {@code TidingsAddons}: it takes the only one, so that a mod can't register under another's
     * ID
     *
     * @throws IllegalStateException if it was already taken
     */
    public static Function<Addon, AddonContext> registrar() {
        if (REGISTRAR_TAKEN.getAndSet(true)) {
            throw new IllegalStateException(
                    "Add-ons are registered through the loader's entry point, such as"
                            + " TidingsAddons");
        }
        return REGISTERED::put;
    }

    /** Called by Tidings once it runs: add-ons' contexts work through {@code host} from then on */
    public synchronized void connect(Host host) {
        this.host = Objects.requireNonNull(host, "host");
    }

    /** Called by Tidings once it stops, unless another one connected since */
    public synchronized void disconnect(Host host) {
        if (this.host == host) this.host = null;
    }

    Host host() {
        return host;
    }

    /**
     * For tests and their own instances: {@link #registered} only takes add-ons through {@link
     * #registrar}
     *
     * @throws IllegalStateException if another add-on has the same ID, or on {@link #registered}
     */
    public AddonContext add(Addon addon) {
        if (this == REGISTERED) {
            throw new IllegalStateException(
                    "Add-ons are registered through the loader's entry point, such as"
                            + " TidingsAddons");
        }
        return put(addon);
    }

    private synchronized AddonContext put(Addon addon) {
        Objects.requireNonNull(addon, "addon");
        if (addons.putIfAbsent(addon.id(), addon) != null) {
            throw new IllegalStateException(
                    "Two add-ons with the ID " + addon.id() + ": a mod can add one tab");
        }
        return new AddonContext(this, addon);
    }

    /** By ID */
    public synchronized List<Addon> all() {
        return List.copyOf(addons.values());
    }

    /** For /api/info: {@code [{id, title, icon}]} */
    public JsonArray toJson() {
        JsonArray json = new JsonArray();
        for (Addon addon : all()) {
            JsonObject a = new JsonObject();
            a.addProperty("id", addon.id());
            a.addProperty("title", addon.title());
            a.addProperty("icon", addon.icon().id());
            json.add(a);
        }
        return json;
    }

    private synchronized Addon addon(String id) {
        Addon addon = addons.get(id);
        if (addon == null) throw new NotFound("This server doesn't have this tab anymore");
        return addon;
    }

    /**
     * Runs on the caller's thread: the API calls it on the server thread
     *
     * @param view null for the add-on's first view
     * @throws IllegalArgumentException if the request is invalid
     */
    public JsonObject view(
            String addonId,
            PlayerProfile player,
            String view,
            Map<String, String> params,
            String locale) {
        Addon addon = addon(addonId);
        String name = view == null ? addon.firstView() : Names.check(view, "view");
        Function<Request, View> code = addon.views().get(name);
        if (code == null) throw new NotFound("This page doesn't exist anymore");
        Request r = request(player, name, params, Map.of(), locale);
        return call(
                addonId + " view " + name,
                () -> Objects.requireNonNull(code.apply(r), "returned null").toJson());
    }

    /**
     * Runs on the caller's thread: the API calls it on the server thread
     *
     * @throws IllegalArgumentException if the request is invalid
     */
    public JsonObject action(
            String addonId,
            PlayerProfile player,
            String action,
            Map<String, String> params,
            Map<String, String> values,
            String locale) {
        Addon addon = addon(addonId);
        String name = Names.check(action, "action");
        Function<Request, ActionResult> code = addon.actions().get(name);
        if (code == null) throw new NotFound("This action doesn't exist anymore");
        Request r = request(player, name, params, values, locale);
        return call(
                addonId + " action " + name,
                () -> Objects.requireNonNull(code.apply(r), "returned null").toJson());
    }

    /**
     * Runs the add-on's own code. Only an {@link AddonError} is meant for the player: anything
     * else, even an IllegalArgumentException such as a NumberFormatException, is a bug in the
     * add-on, which the API logs and answers with a generic error
     */
    private static JsonObject call(String what, Supplier<JsonObject> code) {
        try {
            return code.get();
        } catch (AddonError e) {
            throw e;
        } catch (RuntimeException e) {
            throw new IllegalStateException(what + " failed", e);
        }
    }

    private static Request request(
            PlayerProfile player,
            String name,
            Map<String, String> params,
            Map<String, String> values,
            String locale) {
        if (locale == null) locale = "en";
        if (!LOCALE.matcher(locale).matches()) throw new IllegalArgumentException("Invalid locale");
        return new Request(
                player,
                name,
                check(params, "params", Names.MAX_PARAMS, Names.MAX_PARAM_LENGTH),
                check(values, "values", MAX_VALUES, Field.MAX_TEXT_LENGTH),
                locale);
    }

    /**
     * Form values come from the app, which doesn't say which form they're from: only these limits
     * apply, not each field's own, see {@link Request#values}
     */
    private static final int MAX_VALUES = 64;

    private static Map<String, String> check(
            Map<String, String> strings, String what, int maxCount, int maxLength) {
        if (strings.size() > maxCount) throw new IllegalArgumentException("Too many " + what);
        strings.forEach(
                (name, value) -> {
                    Names.check(name, what);
                    if (value.length() > maxLength) {
                        throw new IllegalArgumentException(name + " is too long");
                    }
                });
        return strings;
    }
}
