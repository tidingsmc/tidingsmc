package dev.tidings.core.addon;

import com.google.gson.JsonObject;

import java.util.Map;

/** Opens one of the same add-on's views. Add-ons can't link anywhere else. */
public record Link(String view, Map<String, String> params) {
    public Link {
        Names.check(view, "view");
        params = Names.checkParams(params);
    }

    public static Link to(String view) {
        return new Link(view, Map.of());
    }

    public static Link to(String view, Map<String, String> params) {
        return new Link(view, params);
    }

    JsonObject toJson() {
        JsonObject json = new JsonObject();
        json.addProperty("view", view);
        if (!params.isEmpty()) json.add("params", Names.toJson(params));
        return json;
    }
}
