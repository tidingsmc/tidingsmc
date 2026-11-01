package dev.tidings.core;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;

import dev.tidings.core.FriendFilter.Friend;
import dev.tidings.core.QuietHours.Period;
import dev.tidings.core.addon.Notification;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Instant;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

final class Json {
    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");

    private Json() {}

    static JsonObject player(PlayerProfile player) {
        JsonObject json = new JsonObject();
        json.addProperty("uuid", player.id().toString());
        json.addProperty("name", player.name());
        if (player.skinUrl() != null) json.addProperty("skinUrl", player.skinUrl());
        return json;
    }

    static PlayerProfile readPlayer(JsonElement json) {
        JsonObject o = object(json, "player");
        String skinUrl = o.has("skinUrl") ? string(o, "skinUrl") : null;
        return new PlayerProfile(uuid(o, "uuid"), string(o, "name"), skinUrl);
    }

    static JsonArray players(List<PlayerProfile> players) {
        JsonArray json = new JsonArray();
        players.forEach(p -> json.add(player(p)));
        return json;
    }

    /** Mirrors the app's PushMessage, for kind "addon". */
    static JsonObject addonPushMessage(String addonId, Notification notification) {
        JsonObject json = pushMessage("addon", notification.player());
        json.addProperty("addon", addonId);
        json.addProperty("text", notification.text());
        if (notification.link() != null) json.add("link", notification.link().toJson());
        return json;
    }

    /** Mirrors the app's PushMessage. */
    static JsonObject pushMessage(NotificationKind kind, PlayerProfile player) {
        return pushMessage(kind.name().toLowerCase(Locale.ROOT), player);
    }

    private static JsonObject pushMessage(String kind, PlayerProfile player) {
        JsonObject json = new JsonObject();
        json.addProperty("kind", kind);
        if (player != null) json.add("player", player(player));
        return json;
    }

    static JsonArray motd(List<Motd.Segment> segments) {
        JsonArray json = new JsonArray();
        for (Motd.Segment segment : segments) {
            JsonObject s = new JsonObject();
            s.addProperty("text", segment.text());
            if (segment.color() != null) s.addProperty("color", segment.color());
            if (segment.bold()) s.addProperty("bold", true);
            if (segment.italic()) s.addProperty("italic", true);
            if (segment.underlined()) s.addProperty("underlined", true);
            if (segment.strikethrough()) s.addProperty("strikethrough", true);
            json.add(s);
        }
        return json;
    }

    static JsonObject settings(DeviceSettings s) {
        JsonObject json = new JsonObject();
        json.addProperty("notifyJoins", s.notifyJoins());
        json.addProperty("notifyLeaves", s.notifyLeaves());
        json.addProperty("notifyServerStatus", s.notifyServerStatus());
        json.addProperty("quietWhileOnline", s.quietWhileOnline());

        JsonObject friends = new JsonObject();
        friends.addProperty("enabled", s.friends().enabled());
        JsonArray friendList = new JsonArray();
        for (Friend friend : s.friends().players()) {
            JsonObject f = new JsonObject();
            f.addProperty("uuid", friend.uuid().toString());
            f.addProperty("name", friend.name());
            friendList.add(f);
        }
        friends.add("players", friendList);
        json.add("friends", friends);

        JsonObject quietHours = new JsonObject();
        quietHours.addProperty("enabled", s.quietHours().enabled());
        JsonArray periods = new JsonArray();
        for (Period period : s.quietHours().periods()) {
            JsonObject p = new JsonObject();
            p.addProperty("start", period.start().format(HH_MM));
            p.addProperty("end", period.end().format(HH_MM));
            periods.add(p);
        }
        quietHours.add("periods", periods);
        json.add("quietHours", quietHours);

        json.addProperty("timeZone", s.timeZone().getId());

        JsonArray mutedAddons = new JsonArray();
        s.mutedAddons().stream().sorted().forEach(mutedAddons::add);
        json.add("mutedAddons", mutedAddons);
        return json;
    }

    static DeviceSettings patchSettings(DeviceSettings base, JsonElement changes) {
        JsonObject c = object(changes, "settings");
        return new DeviceSettings(
                c.has("notifyJoins") ? bool(c, "notifyJoins") : base.notifyJoins(),
                c.has("notifyLeaves") ? bool(c, "notifyLeaves") : base.notifyLeaves(),
                c.has("notifyServerStatus")
                        ? bool(c, "notifyServerStatus")
                        : base.notifyServerStatus(),
                c.has("quietWhileOnline") ? bool(c, "quietWhileOnline") : base.quietWhileOnline(),
                c.has("friends") ? readFriends(c.get("friends")) : base.friends(),
                c.has("quietHours") ? readQuietHours(c.get("quietHours")) : base.quietHours(),
                c.has("timeZone")
                        ? DeviceSettings.parseTimeZone(string(c, "timeZone"))
                        : base.timeZone(),
                c.has("mutedAddons") ? readMutedAddons(c) : base.mutedAddons());
    }

    private static Set<String> readMutedAddons(JsonObject o) {
        JsonArray ids = array(o, "mutedAddons");
        if (ids.size() > DeviceSettings.MAX_MUTED_ADDONS) {
            throw new IllegalArgumentException("Too many muted add-ons");
        }
        Set<String> muted = new HashSet<>();
        for (JsonElement id : ids) {
            if (!(id instanceof JsonPrimitive p) || !p.isString()) {
                throw new IllegalArgumentException("Expected text in mutedAddons");
            }
            muted.add(p.getAsString());
        }
        return muted;
    }

    private static FriendFilter readFriends(JsonElement json) {
        JsonObject o = object(json, "friends");
        List<Friend> friends = new ArrayList<>();
        for (JsonElement f : array(o, "players")) {
            JsonObject friend = object(f, "friend");
            friends.add(new Friend(uuid(friend, "uuid"), string(friend, "name")));
        }
        return new FriendFilter(bool(o, "enabled"), friends);
    }

    private static QuietHours readQuietHours(JsonElement json) {
        JsonObject o = object(json, "quietHours");
        List<Period> periods = new ArrayList<>();
        for (JsonElement p : array(o, "periods")) {
            JsonObject period = object(p, "quiet period");
            periods.add(new Period(time(period, "start"), time(period, "end")));
        }
        return new QuietHours(bool(o, "enabled"), periods);
    }

    static JsonObject push(PushSubscription push) {
        JsonObject keys = new JsonObject();
        keys.addProperty("p256dh", push.p256dh());
        keys.addProperty("auth", push.auth());
        JsonObject json = new JsonObject();
        json.addProperty("endpoint", push.endpoint().toString());
        json.add("keys", keys);
        return json;
    }

    static PushSubscription readPush(JsonElement json) {
        JsonObject o = object(json, "push subscription");
        JsonObject keys = object(o.get("keys"), "keys");
        try {
            return new PushSubscription(
                    new URI(string(o, "endpoint")), string(keys, "p256dh"), string(keys, "auth"));
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("Invalid push endpoint", e);
        }
    }

    static JsonObject device(Device d) {
        JsonObject json = new JsonObject();
        json.addProperty("id", d.id());
        json.addProperty("tokenHash", d.tokenHash());
        json.addProperty("name", d.name());
        json.add("player", player(d.player()));
        json.addProperty("pairedAt", d.pairedAt().toString());
        json.add("settings", settings(d.settings()));
        if (d.push() != null) json.add("push", push(d.push()));
        return json;
    }

    static Device readDevice(JsonElement json) {
        JsonObject o = object(json, "device");
        Instant pairedAt;
        try {
            pairedAt = Instant.parse(string(o, "pairedAt"));
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("Invalid pairedAt", e);
        }
        return new Device(
                string(o, "id"),
                string(o, "tokenHash"),
                string(o, "name"),
                readPlayer(o.get("player")),
                pairedAt,
                patchSettings(DeviceSettings.defaults(), o.get("settings")),
                o.has("push") ? readStoredPush(o.get("push")) : null);
    }

    /**
     * A subscription saved before its checks got stricter is dropped rather than failing the whole
     * file: the app sends a new one next time it's opened.
     */
    private static PushSubscription readStoredPush(JsonElement json) {
        try {
            return readPush(json);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    static JsonObject object(JsonElement json, String what) {
        if (json == null || !json.isJsonObject()) {
            throw new IllegalArgumentException("Expected an object for " + what);
        }
        return json.getAsJsonObject();
    }

    static JsonArray array(JsonObject o, String field) {
        JsonElement e = o.get(field);
        if (e == null || !e.isJsonArray()) {
            throw new IllegalArgumentException("Expected a list for " + field);
        }
        return e.getAsJsonArray();
    }

    static String string(JsonObject o, String field) {
        JsonElement e = o.get(field);
        if (e instanceof JsonPrimitive p && p.isString()) return p.getAsString();
        throw new IllegalArgumentException("Expected text for " + field);
    }

    /** An object of strings, such as an add-on's params; empty if {@code field} is missing. */
    static Map<String, String> strings(JsonObject o, String field) {
        if (!o.has(field)) return Map.of();
        JsonObject strings = object(o.get(field), field);
        Map<String, String> map = new HashMap<>();
        for (String name : strings.keySet()) map.put(name, string(strings, name));
        return map;
    }

    static boolean bool(JsonObject o, String field) {
        JsonElement e = o.get(field);
        if (e instanceof JsonPrimitive p && p.isBoolean()) return p.getAsBoolean();
        throw new IllegalArgumentException("Expected true or false for " + field);
    }

    private static UUID uuid(JsonObject o, String field) {
        return uuid(string(o, field), field);
    }

    static UUID uuid(String text, String field) {
        try {
            return UUID.fromString(text);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid UUID for " + field, e);
        }
    }

    private static LocalTime time(JsonObject o, String field) {
        try {
            return LocalTime.parse(string(o, field), HH_MM);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("Expected HH:MM for " + field, e);
        }
    }
}
