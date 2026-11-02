package dev.tidings.core.addon;

import com.google.gson.JsonObject;

/**
 * What the app does once an action is done: it shows {@code message} if any, then opens {@code
 * link}, or else loads the current view again, so it shows what changed
 */
public record ActionResult(String message, Link link) {
    public static ActionResult done() {
        return new ActionResult(null, null);
    }

    public static ActionResult message(String message) {
        return new ActionResult(message, null);
    }

    public static ActionResult open(Link link) {
        return new ActionResult(null, link);
    }

    public ActionResult then(Link link) {
        return new ActionResult(message, link);
    }

    JsonObject toJson() {
        JsonObject json = new JsonObject();
        if (message != null) json.addProperty("message", message);
        if (link != null) json.add("link", link.toJson());
        return json;
    }
}
