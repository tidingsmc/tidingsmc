package dev.tidings.core;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;

import dev.tidings.core.addon.AddonError;
import dev.tidings.core.addon.Addons;
import dev.tidings.core.addon.ImageData;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.Base64;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import java.util.function.Supplier;

public final class Api {
    private static final Logger LOGGER = LoggerFactory.getLogger(Api.class);

    public static final int MAX_BODY_BYTES = 64 * 1024;

    private static final int MAX_DEVICE_NAME_LENGTH = 64;

    private final Tidings tidings;
    private final Clock clock;

    public Api(Tidings tidings) {
        this(tidings, Clock.systemUTC());
    }

    Api(Tidings tidings, Clock clock) {
        this.tidings = tidings;
        this.clock = clock;
    }

    /**
     * @param path without the query string
     * @param authorization the Authorization header, or null
     * @param client the caller's address, for the pairing rate limit
     */
    public record Request(
            String method, String path, String authorization, byte[] body, String client) {}

    /** {@code body} is null for 204 */
    public record Response(int status, JsonElement body) {
        static Response ok(JsonElement body) {
            return new Response(200, body);
        }

        static Response noContent() {
            return new Response(204, null);
        }
    }

    private static final class HttpError extends RuntimeException {
        final int status;

        final String reason;

        HttpError(int status, String message) {
            this(status, message, null);
        }

        HttpError(int status, String message, String reason) {
            super(message);
            this.status = status;
            this.reason = reason;
        }
    }

    public Response handle(Request request) {
        try {
            return route(request);
        } catch (HttpError e) {
            return error(e.status, e.getMessage(), e.reason);
        } catch (Addons.NotFound e) {
            return error(404, e.getMessage(), null);
        } catch (AddonError e) {
            return error(400, e.getMessage(), null);
        } catch (IllegalArgumentException e) {
            return error(400, e.getMessage(), null);
        } catch (RuntimeException e) {
            LOGGER.error("{} {} failed", request.method(), request.path(), e);
            return error(500, "Something went wrong on the server", null);
        }
    }

    private static Response error(int status, String message, String reason) {
        JsonObject body = new JsonObject();
        body.addProperty("error", message);
        if (reason != null) body.addProperty("reason", reason);
        return new Response(status, body);
    }

    private Response route(Request request) {
        String method = request.method();
        return switch (request.path()) {
            case "/api/pair" ->
                    switch (method) {
                        case "POST" -> pair(request.client(), readBody(request));
                        default -> throw methodNotAllowed();
                    };
            case "/api/info" ->
                    switch (method) {
                        case "GET" -> info(authenticate(request));
                        default -> throw methodNotAllowed();
                    };
            case "/api/online" ->
                    switch (method) {
                        case "GET" -> online(authenticate(request));
                        default -> throw methodNotAllowed();
                    };
            case "/api/players" ->
                    switch (method) {
                        case "GET" -> players(authenticate(request));
                        default -> throw methodNotAllowed();
                    };
            case "/api/devices/me" ->
                    switch (method) {
                        case "DELETE" -> unpair(request);
                        default -> throw methodNotAllowed();
                    };
            case "/api/devices/me/settings" ->
                    switch (method) {
                        case "GET" -> Response.ok(Json.settings(authenticate(request).settings()));
                        case "PATCH" -> updateSettings(authenticate(request), readBody(request));
                        default -> throw methodNotAllowed();
                    };
            case "/api/devices/me/approval" ->
                    switch (method) {
                        case "GET" -> approvalStatus(request);
                        case "POST" -> askApproval(request);
                        default -> throw methodNotAllowed();
                    };
            case "/api/devices/me/push" ->
                    switch (method) {
                        case "PUT" -> updatePush(authenticate(request), readBody(request));
                        default -> throw methodNotAllowed();
                    };
            default -> {
                if (request.path().startsWith(IMAGES_PATH)) yield image(request);
                if (!request.path().startsWith(ADDONS_PATH)) throw new HttpError(404, "Not found");
                yield addon(request);
            }
        };
    }

    private static final String IMAGES_PATH = "/api/images/";

    // How many images sent to devices are remembered, see sent
    private static final int MAX_SENT_IMAGES = 50_000;

    // "<device ID> <hash>" of the images each device was sent in a view, least recent first: a
    // device can fetch only those, so one player's images don't reach another's devices
    private final Map<String, Boolean> sentImages =
            Collections.synchronizedMap(
                    new LinkedHashMap<>(16, 0.75f, true) {
                        @Override
                        protected boolean removeEldestEntry(Map.Entry<String, Boolean> eldest) {
                            return size() > MAX_SENT_IMAGES;
                        }
                    });

    /** Remembers the images of {@code shown} as sent to {@code device} */
    private JsonObject sent(Device device, Addons.Shown shown) {
        shown.images().forEach(hash -> sentImages.put(device.id() + " " + hash, true));
        return shown.json();
    }

    /**
     * {@code GET /api/images/<hash>}: an add-on's image that views sent to this device refer to as
     * {@code image:<hash>}, as {@code {type, data}} with the bytes in base64 so the relay can carry
     * it. A hash always means the same bytes, so the app keeps what it gets
     */
    private Response image(Request request) {
        if (!request.method().equals("GET")) throw methodNotAllowed();
        Device device = authenticate(request);
        String hash = request.path().substring(IMAGES_PATH.length());
        if (sentImages.get(device.id() + " " + hash) == null) {
            throw new HttpError(404, "No such image");
        }
        ImageData image =
                ImageData.find(hash).orElseThrow(() -> new HttpError(404, "No such image"));
        JsonObject body = new JsonObject();
        body.addProperty("type", image.type());
        body.addProperty("data", image.base64());
        return Response.ok(body);
    }

    private static final String ADDONS_PATH = "/api/addons/";

    /**
     * {@code POST /api/addons/<id>/view} with {@code {view?, params?, locale?}}, and {@code
     * /action} with {@code {action, params?, values?, locale?}}: see {@link Addons}
     */
    private Response addon(Request request) {
        String[] parts = request.path().substring(ADDONS_PATH.length()).split("/", -1);
        if (parts.length != 2) throw new HttpError(404, "Not found");

        String id = parts[0];
        String kind = parts[1];
        if (!kind.equals("view") && !kind.equals("action")) throw new HttpError(404, "Not found");
        if (!request.method().equals("POST")) throw methodNotAllowed();

        Device device = authenticate(request);
        JsonObject body = Json.object(readBody(request), "request");
        Map<String, String> params = Json.strings(body, "params");

        String locale = body.has("locale") ? Json.string(body, "locale") : null;
        PlayerProfile player =
                tidings.store().knownPlayer(device.player().id()).orElse(device.player());

        Addons addons = tidings.addons();

        if (kind.equals("view")) {
            String view = body.has("view") ? Json.string(body, "view") : null;
            return Response.ok(
                    sent(device, onServerThread(() -> addons.view(id, player, view, params, locale))));
        }
        String action = Json.string(body, "action");
        Map<String, String> values = Json.strings(body, "values");
        return Response.ok(
                onServerThread(() -> addons.action(id, player, action, params, values, locale)));
    }

    // How many requests may wait on the server thread at once
    private static final int MAX_WAITING_ON_SERVER = 4;

    private final Semaphore waitingOnServer = new Semaphore(MAX_WAITING_ON_SERVER);

    private <T> T onServerThread(Supplier<T> task) {
        if (!waitingOnServer.tryAcquire()) {
            throw new HttpError(503, "The server is busy: try again in a moment");
        }
        try {
            return tidings.game().onServerThread(task);
        } finally {
            waitingOnServer.release();
        }
    }

    private static HttpError methodNotAllowed() {
        return new HttpError(405, "Method not allowed");
    }

    private static String token(Request request) {
        String header = request.authorization();
        if (header == null || !header.regionMatches(true, 0, "Bearer ", 0, 7)) return null;
        return header.substring(7).strip();
    }

    private Device authenticate(Request request) {
        String token = token(request);
        if (token == null) {
            throw new HttpError(401, "This device isn't paired with this server", "unpaired");
        }
        Optional<Device> device = tidings.store().deviceByToken(token);
        if (device.isPresent()) return device.get();
        return switch (tidings.approvalStatus(token, clock.instant())) {
            case PENDING ->
                    throw new HttpError(403, "Approve this device in Minecraft first", "pending");
            case APPROVED -> tidings.store().deviceByToken(token).orElseThrow(Api::unpaired);
            default -> throw unpaired();
        };
    }

    private static HttpError unpaired() {
        return new HttpError(401, "This device isn't paired with this server anymore", "unpaired");
    }

    private static JsonElement readBody(Request request) {
        byte[] bytes = request.body();
        if (bytes.length > MAX_BODY_BYTES) throw new HttpError(413, "Request too large");
        try {
            return JsonParser.parseString(new String(bytes, StandardCharsets.UTF_8));
        } catch (JsonParseException e) {
            throw new HttpError(400, "Invalid JSON");
        }
    }

    private Response pair(String client, JsonElement body) {
        JsonObject request = Json.object(body, "request");
        String code = Json.string(request, "code");
        String deviceName = deviceName(request);
        String token = Tokens.newToken();
        JsonObject response = new JsonObject();
        response.addProperty("serverId", tidings.store().serverId());
        String serverName = tidings.game().serverName();
        if (!serverName.isEmpty()) response.addProperty("serverName", serverName);
        response.addProperty("token", token);
        response.addProperty("vapidPublicKey", tidings.store().vapidKeys().applicationServerKey());
        Pairing.Redemption redemption =
                tidings.pairing()
                        .redeem(
                                code,
                                client,
                                clock.instant(),
                                player ->
                                        !tidings.store()
                                                .hasMaxDevices(
                                                        player.id(),
                                                        Tidings.MAX_DEVICES_PER_PLAYER));
        if (redemption instanceof Pairing.Redemption.TooManyAttempts) {
            throw new HttpError(429, "Too many wrong codes: wait a minute and try again");
        }
        if (redemption instanceof Pairing.Redemption.Refused) {
            throw new HttpError(
                    409,
                    "You already have "
                            + Tidings.MAX_DEVICES_PER_PLAYER
                            + " paired devices: unpair one in game with /tidings devices");
        }
        if (!(redemption instanceof Pairing.Redemption.Paired paired)) {
            throw new HttpError(403, "This code is wrong or has expired");
        }
        response.add("player", Json.player(paired.player()));
        Device device =
                new Device(
                        UUID.randomUUID().toString(),
                        Tokens.hash(token),
                        deviceName,
                        paired.player(),
                        clock.instant(),
                        DeviceSettings.defaults(),
                        null);
        tidings.awaitApproval(device, clock.instant());
        return Response.ok(response);
    }

    private static String deviceName(JsonObject request) {
        String name =
                request.has("deviceName")
                        ? Json.string(request, "deviceName")
                                .replaceAll(
                                        "[\\p{Cc}\\p{Zl}\\p{Zp}\\u061C\\u200E\\u200F"
                                                + "\\u202A-\\u202E\\u2066-\\u2069]+",
                                        " ")
                                .replace("§", "")
                                .strip()
                        : "";
        if (name.isEmpty()) return "Device";
        if (name.codePointCount(0, name.length()) <= MAX_DEVICE_NAME_LENGTH) return name;
        return name.substring(0, name.offsetByCodePoints(0, MAX_DEVICE_NAME_LENGTH)).strip();
    }

    private Response info(Device device) {
        Game game = tidings.game();
        JsonObject response = new JsonObject();
        response.add("motd", Json.motd(Motd.parse(game.motd())));
        byte[] icon = game.icon();
        if (icon != null) {
            response.addProperty(
                    "icon", "data:image/png;base64," + Base64.getEncoder().encodeToString(icon));
        }
        response.addProperty("version", game.version());
        JsonArray addons = tidings.addons().toJson();
        if (!addons.isEmpty()) response.add("addons", addons);
        return Response.ok(response);
    }

    private Response online(Device device) {
        Game.WorldState world = onServerThread(tidings.game()::world);
        JsonObject worldJson = new JsonObject();
        worldJson.addProperty("dayTime", world.dayTime());
        worldJson.addProperty("day", world.day());
        worldJson.addProperty("weather", world.weather().name().toLowerCase());
        JsonObject response = new JsonObject();
        response.add("players", Json.players(shownTo(device, tidings.onlinePlayers())));
        response.add("world", worldJson);
        return Response.ok(response);
    }

    private Response players(Device device) {
        JsonObject response = new JsonObject();
        response.add("players", Json.players(tidings.store().knownPlayers()));
        return Response.ok(response);
    }

    private List<PlayerProfile> shownTo(Device device, List<PlayerProfile> players) {
        UUID own = device.player().id();
        return players.stream()
                .filter(p -> p.id().equals(own) || tidings.isAnnounced(p.id()))
                .toList();
    }

    private Response updateSettings(Device device, JsonElement changes) {
        Device updated =
                tidings.store()
                        .updateDevice(
                                device.id(),
                                d -> d.withSettings(Json.patchSettings(d.settings(), changes)))
                        .orElseThrow(Api::unpaired);
        return Response.ok(Json.settings(updated.settings()));
    }

    private Response updatePush(Device device, JsonElement subscription) {
        PushSubscription push = Json.readPush(subscription);
        tidings.store().updateDevice(device.id(), d -> d.withPush(push)).orElseThrow(Api::unpaired);
        return Response.noContent();
    }

    private Response askApproval(Request request) {
        String token = token(request);
        if (token != null && tidings.askApproval(token, clock.instant())) {
            return Response.noContent();
        }
        authenticate(request);
        return Response.noContent();
    }

    private Response approvalStatus(Request request) {
        String token = token(request);
        Tidings.ApprovalStatus status =
                token == null
                        ? Tidings.ApprovalStatus.UNKNOWN
                        : tidings.approvalStatus(token, clock.instant());
        if (status == Tidings.ApprovalStatus.UNKNOWN) throw unpaired();
        JsonObject response = new JsonObject();
        response.addProperty(
                "approval",
                switch (status) {
                    case PENDING -> "pending";
                    case APPROVED -> "approved";
                    case DENIED -> "denied";
                    case PLAYER_OFFLINE -> "playerOffline";
                    case UNKNOWN -> throw new AssertionError();
                });
        return Response.ok(response);
    }

    private Response unpair(Request request) {
        String token = token(request);
        if (token != null && tidings.withdraw(token, clock.instant())) return Response.noContent();
        Device device = authenticate(request);
        tidings.store().removeDevice(device.player().id(), device.id());
        return Response.noContent();
    }
}
