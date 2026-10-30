package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

class ApiServerTest {
    private final PlayerProfile steve = new PlayerProfile(UUID.randomUUID(), "Steve", null);
    private final PlayerProfile alex = new PlayerProfile(UUID.randomUUID(), "Alex", null);
    private final HttpClient client = HttpClient.newHttpClient();
    private final FakeGame game = new FakeGame();
    private Tidings tidings;
    private ApiServer server;

    /** Devices the game was asked to approve. */
    private final List<Device> requests = new ArrayList<>();

    @BeforeEach
    void start() throws IOException {
        tidings = new Tidings(Store.inMemory(), game);
        tidings.onApprovalNeeded(requests::add);
        server =
                new ApiServer(
                        tidings,
                        new InetSocketAddress(InetAddress.getLoopbackAddress(), 0),
                        "X-Forwarded-For");
    }

    @AfterEach
    void stop() {
        server.close();
    }

    private HttpResponse<String> call(String method, String path, String token, String body)
            throws IOException, InterruptedException {
        return call(method, path, token, body, null);
    }

    /** {@code forwardedFor}: the client a proxy on this machine says it forwards for, or null. */
    private HttpResponse<String> call(
            String method, String path, String token, String body, String forwardedFor)
            throws IOException, InterruptedException {
        HttpRequest.Builder request =
                HttpRequest.newBuilder(URI.create("http://localhost:" + server.port() + path))
                        .method(
                                method,
                                body == null
                                        ? BodyPublishers.noBody()
                                        : BodyPublishers.ofString(body));
        if (token != null) request.header("Authorization", "Bearer " + token);
        if (forwardedFor != null) request.header("X-Forwarded-For", forwardedFor);
        return client.send(request.build(), BodyHandlers.ofString());
    }

    private static JsonObject json(HttpResponse<String> response) {
        return JsonParser.parseString(response.body()).getAsJsonObject();
    }

    private String pair() throws IOException, InterruptedException {
        String token = sendCode(tidings.startPairing(steve, Instant.now()).orElseThrow());
        askApproval(token);
        approve(requests.get(requests.size() - 1));
        return token;
    }

    /** Sends {@code code} as the app does, and gets its token. */
    private String sendCode(String code) throws IOException, InterruptedException {
        HttpResponse<String> response =
                call("POST", "/api/pair", null, "{\"code\":\"" + code + "\"}");
        assertEquals(200, response.statusCode(), response.body());
        return json(response).get("token").getAsString();
    }

    /** What the app does once the player named the server. */
    private void askApproval(String token) throws IOException, InterruptedException {
        assertEquals(204, call("POST", "/api/devices/me/approval", token, null).statusCode());
    }

    private void approve(Device device) {
        assertTrue(
                tidings.approve(steve.id(), device.id(), Instant.now())
                        instanceof Tidings.Approval.Approved);
    }

    @Test
    void pairingAnswersWhatTheAppStores() throws IOException, InterruptedException {
        String code = tidings.startPairing(steve, Instant.now()).orElseThrow();

        JsonObject paired =
                json(
                        call(
                                "POST",
                                "/api/pair",
                                null,
                                "{\"code\":\"" + code + "\",\"deviceName\":\"Pixel 8\"}"));

        assertEquals(tidings.store().serverId(), paired.get("serverId").getAsString());
        assertEquals("Test server", paired.get("serverName").getAsString());
        assertEquals(
                tidings.store().vapidKeys().applicationServerKey(),
                paired.get("vapidPublicKey").getAsString());
        assertEquals("Steve", paired.getAsJsonObject("player").get("name").getAsString());
        askApproval(paired.get("token").getAsString());
        Device device = requests.get(0);
        assertEquals("Pixel 8", device.name());
        assertEquals(steve, device.player());
    }

    @Test
    void noServerNameUnlessTheOwnerSetOne() throws IOException, InterruptedException {
        game.serverName = "";
        String code = tidings.startPairing(steve, Instant.now()).orElseThrow();

        JsonObject paired = json(call("POST", "/api/pair", null, "{\"code\":\"" + code + "\"}"));

        assertFalse(paired.has("serverName"));
    }

    @Test
    void asksThePlayerToApproveOnceTheAppAsks() throws IOException, InterruptedException {
        String code = tidings.startPairing(steve, Instant.now()).orElseThrow();

        String token =
                json(call(
                                "POST",
                                "/api/pair",
                                null,
                                "{\"code\":\""
                                        + code
                                        + "\",\"deviceName\":\"Pixel\\n"
                                        + "\\u00a7cRed\\u202e\\u2028\\u0085x\"}"))
                        .get("token")
                        .getAsString();
        assertTrue(requests.isEmpty());
        askApproval(token);
        askApproval(token);

        assertEquals(1, requests.size());
        assertEquals("Pixel cRed x", requests.get(0).name());
        assertTrue(tidings.store().devices().isEmpty());
    }

    @Test
    void aDeviceWaitsForApproval() throws IOException, InterruptedException {
        String code = tidings.startPairing(steve, Instant.now()).orElseThrow();
        String token = sendCode(code);
        askApproval(token);

        HttpResponse<String> waiting = call("GET", "/api/online", token, null);
        assertEquals(403, waiting.statusCode());
        assertEquals("pending", json(waiting).get("reason").getAsString());

        approve(requests.get(0));
        assertEquals(200, call("GET", "/api/online", token, null).statusCode());
    }

    @Test
    void aDeniedDeviceIsUnpaired() throws IOException, InterruptedException {
        String code = tidings.startPairing(steve, Instant.now()).orElseThrow();
        String token = sendCode(code);
        askApproval(token);

        assertTrue(tidings.deny(steve.id(), requests.get(0).id(), Instant.now()).isPresent());

        HttpResponse<String> response = call("GET", "/api/online", token, null);
        assertEquals(401, response.statusCode());
        assertEquals("unpaired", json(response).get("reason").getAsString());
        assertTrue(tidings.store().devices().isEmpty());
    }

    @Test
    void theAppCanWithdrawAPairingWaitingForApproval() throws IOException, InterruptedException {
        String code = tidings.startPairing(steve, Instant.now()).orElseThrow();
        String token = sendCode(code);
        askApproval(token);

        assertEquals(204, call("DELETE", "/api/devices/me", token, null).statusCode());

        assertTrue(
                tidings.approve(steve.id(), requests.get(0).id(), Instant.now())
                        instanceof Tidings.Approval.NotFound);
        assertEquals(401, call("GET", "/api/online", token, null).statusCode());
    }

    @Test
    void onlyAPairingAsksForApproval() throws IOException, InterruptedException {
        assertEquals(401, call("POST", "/api/devices/me/approval", "made-up", null).statusCode());
        assertTrue(requests.isEmpty());
    }

    @Test
    void onlyItsPlayerApprovesADevice() throws IOException, InterruptedException {
        String code = tidings.startPairing(steve, Instant.now()).orElseThrow();
        askApproval(sendCode(code));

        assertTrue(
                tidings.approve(alex.id(), requests.get(0).id(), Instant.now())
                        instanceof Tidings.Approval.NotFound);
        assertTrue(tidings.store().devices().isEmpty());
    }

    @Test
    void approvalExpires() throws IOException, InterruptedException {
        String code = tidings.startPairing(steve, Instant.now()).orElseThrow();
        askApproval(sendCode(code));

        assertTrue(
                tidings.approve(
                                steve.id(),
                                requests.get(0).id(),
                                Instant.now().plus(Tidings.APPROVAL_TIME))
                        instanceof Tidings.Approval.NotFound);
    }

    private String approvalOf(String token) throws IOException, InterruptedException {
        HttpResponse<String> response = call("GET", "/api/devices/me/approval", token, null);
        assertEquals(200, response.statusCode(), response.body());
        return json(response).get("approval").getAsString();
    }

    @Test
    void tellsTheAppWhereItsPairingStands() throws IOException, InterruptedException {
        String approved = sendCode(tidings.startPairing(steve, Instant.now()).orElseThrow());
        askApproval(approved);
        assertEquals("pending", approvalOf(approved));
        approve(requests.get(0));
        assertEquals("approved", approvalOf(approved));

        String denied = sendCode(tidings.startPairing(steve, Instant.now()).orElseThrow());
        askApproval(denied);
        tidings.deny(steve.id(), requests.get(1).id(), Instant.now());
        assertEquals("denied", approvalOf(denied));

        String offline = sendCode(tidings.startPairing(steve, Instant.now()).orElseThrow());
        askApproval(offline);
        tidings.playerOffline(steve.id(), requests.get(2).id(), Instant.now());
        assertEquals("playerOffline", approvalOf(offline));

        assertEquals(401, call("GET", "/api/devices/me/approval", "made-up", null).statusCode());
    }

    @Test
    void anExpiredPairingIsForgotten() throws IOException, InterruptedException {
        String token = sendCode(tidings.startPairing(steve, Instant.now()).orElseThrow());
        askApproval(token);

        assertEquals(
                Tidings.ApprovalStatus.UNKNOWN,
                tidings.approvalStatus(token, Instant.now().plus(Tidings.APPROVAL_TIME)));
    }

    @Test
    void aDeniedPairingCantBeApprovedAfter() throws IOException, InterruptedException {
        String token = sendCode(tidings.startPairing(steve, Instant.now()).orElseThrow());
        askApproval(token);
        tidings.deny(steve.id(), requests.get(0).id(), Instant.now());

        assertTrue(
                tidings.approve(steve.id(), requests.get(0).id(), Instant.now())
                        instanceof Tidings.Approval.NotFound);
        assertTrue(tidings.deny(steve.id(), requests.get(0).id(), Instant.now()).isEmpty());
        assertEquals(401, call("GET", "/api/online", token, null).statusCode());
        assertEquals("denied", approvalOf(token));
    }

    @Test
    void thePlayerHasTheWholeApprovalTimeOnceAsked() throws IOException, InterruptedException {
        String token = sendCode(tidings.startPairing(steve, Instant.now()).orElseThrow());
        Instant later = Instant.now().plus(Tidings.APPROVAL_TIME.minusSeconds(10));
        assertTrue(tidings.askApproval(token, later));

        assertTrue(
                tidings.approve(steve.id(), requests.get(0).id(), later.plusSeconds(60))
                        instanceof Tidings.Approval.Approved);
    }

    @Test
    void aDeviceBeyondTheLimitKeepsWaiting() throws IOException, InterruptedException {
        String token = sendCode(tidings.startPairing(steve, Instant.now()).orElseThrow());
        askApproval(token);
        for (int i = 0; i < Tidings.MAX_DEVICES_PER_PLAYER; i++) {
            tidings.store()
                    .addDevice(
                            new Device(
                                    "d" + i,
                                    "hash-" + i,
                                    "d" + i,
                                    steve,
                                    Instant.EPOCH,
                                    DeviceSettings.defaults(),
                                    null));
        }

        assertTrue(
                tidings.approve(steve.id(), requests.get(0).id(), Instant.now())
                        instanceof Tidings.Approval.TooManyDevices);
        assertEquals("pending", approvalOf(token));

        tidings.unpair(steve.id(), "d0");
        approve(requests.get(0));
    }

    @Test
    void noDeviceIsSavedIfTheAnswerCantBeMade() throws IOException, InterruptedException {
        game.serverName = null;
        String code = tidings.startPairing(steve, Instant.now()).orElseThrow();

        HttpResponse<String> response =
                call("POST", "/api/pair", null, "{\"code\":\"" + code + "\"}");

        assertEquals(500, response.statusCode());
        assertTrue(tidings.store().devices().isEmpty());
        game.serverName = "Test server";
        assertEquals(
                200, call("POST", "/api/pair", null, "{\"code\":\"" + code + "\"}").statusCode());
    }

    @Test
    void refusesPairingBeyondTheDeviceLimit() throws IOException, InterruptedException {
        String code = tidings.startPairing(steve, Instant.now()).orElseThrow();
        for (int i = 0; i < Tidings.MAX_DEVICES_PER_PLAYER; i++) {
            tidings.store()
                    .addDevice(
                            new Device(
                                    "d" + i,
                                    "hash" + i,
                                    "Phone",
                                    steve,
                                    Instant.now(),
                                    DeviceSettings.defaults(),
                                    null));
        }

        HttpResponse<String> response =
                call("POST", "/api/pair", null, "{\"code\":\"" + code + "\"}");

        assertEquals(409, response.statusCode());
        assertEquals(Tidings.MAX_DEVICES_PER_PLAYER, tidings.store().devices().size());

        // The code still works once a device is unpaired.
        tidings.store().removeDevice(steve.id(), "d0");
        assertEquals(
                200, call("POST", "/api/pair", null, "{\"code\":\"" + code + "\"}").statusCode());
    }

    @Test
    void cutsLongDeviceNamesBetweenCharacters() throws IOException, InterruptedException {
        String code = tidings.startPairing(steve, Instant.now()).orElseThrow();
        String name = "a".repeat(63) + "\uD83D\uDE00" + "b";

        String token =
                json(call(
                                "POST",
                                "/api/pair",
                                null,
                                "{\"code\":\"" + code + "\",\"deviceName\":\"" + name + "\"}"))
                        .get("token")
                        .getAsString();
        askApproval(token);

        assertEquals("a".repeat(63) + "\uD83D\uDE00", requests.get(0).name());
    }

    @Test
    void wrongCodesAreRefused() throws IOException, InterruptedException {
        HttpResponse<String> response =
                call("POST", "/api/pair", null, "{\"code\":\"123456\",\"deviceName\":\"x\"}");

        assertEquals(403, response.statusCode());
        assertTrue(json(response).has("error"));
    }

    @Test
    void someoneGuessingCodesDoesntBlockOthersBehindTheSameProxy()
            throws IOException, InterruptedException {
        String code = tidings.startPairing(steve, Instant.now()).orElseThrow();
        String wrong = code.equals("000000") ? "000001" : "000000";
        for (int i = 0; i < Pairing.MAX_FAILURES; i++) {
            call("POST", "/api/pair", null, "{\"code\":\"" + wrong + "\"}", "198.51.100.7");
        }

        assertEquals(
                429,
                call("POST", "/api/pair", null, "{\"code\":\"" + code + "\"}", "198.51.100.7")
                        .statusCode());
        assertEquals(
                200,
                call("POST", "/api/pair", null, "{\"code\":\"" + code + "\"}", "203.0.113.1")
                        .statusCode());
    }

    @Test
    void everythingElseNeedsAToken() throws IOException, InterruptedException {
        for (String token : new String[] {null, "made-up"}) {
            HttpResponse<String> response = call("GET", "/api/online", token, null);

            assertEquals(401, response.statusCode());
            assertEquals("unpaired", json(response).get("reason").getAsString());
        }
    }

    @Test
    void online() throws IOException, InterruptedException {
        String token = pair();
        tidings.playerJoined(alex, Instant.EPOCH);

        JsonObject online = json(call("GET", "/api/online", token, null));

        assertEquals(1, online.getAsJsonArray("players").size());
        assertEquals(
                alex.id().toString(),
                online.getAsJsonArray("players")
                        .get(0)
                        .getAsJsonObject()
                        .get("uuid")
                        .getAsString());
        assertEquals("rain", online.getAsJsonObject("world").get("weather").getAsString());
        assertEquals(6000, online.getAsJsonObject("world").get("dayTime").getAsInt());
    }

    @Test
    void info() throws IOException, InterruptedException {
        String token = pair();
        game.icon = new byte[] {1, 2, 3};

        JsonObject info = json(call("GET", "/api/info", token, null));

        assertEquals("1.20.1", info.get("version").getAsString());
        assertEquals("data:image/png;base64,AQID", info.get("icon").getAsString());
        JsonObject segment = info.getAsJsonArray("motd").get(0).getAsJsonObject();
        assertEquals("A Minecraft Server", segment.get("text").getAsString());
        assertEquals("gold", segment.get("color").getAsString());
        assertFalse(segment.has("bold"));
    }

    @Test
    void settingsArePatchedFieldByField() throws IOException, InterruptedException {
        String token = pair();

        HttpResponse<String> patched =
                call(
                        "PATCH",
                        "/api/devices/me/settings",
                        token,
                        "{\"notifyLeaves\":true,\"timeZone\":\"Europe/Paris\","
                                + "\"quietHours\":{\"enabled\":true,"
                                + "\"periods\":[{\"start\":\"23:00\",\"end\":\"07:30\"}]}}");

        assertEquals(200, patched.statusCode(), patched.body());
        JsonObject settings = json(call("GET", "/api/devices/me/settings", token, null));
        assertEquals(json(patched), settings);
        assertTrue(settings.get("notifyLeaves").getAsBoolean());
        assertTrue(settings.get("notifyJoins").getAsBoolean());
        assertEquals("Europe/Paris", settings.get("timeZone").getAsString());
        assertEquals(
                "07:30",
                settings.getAsJsonObject("quietHours")
                        .getAsJsonArray("periods")
                        .get(0)
                        .getAsJsonObject()
                        .get("end")
                        .getAsString());
    }

    @Test
    void invalidSettingsAreRefused() throws IOException, InterruptedException {
        String token = pair();

        HttpResponse<String> response =
                call("PATCH", "/api/devices/me/settings", token, "{\"timeZone\":\"Mars/Base\"}");

        assertEquals(400, response.statusCode());
        assertEquals("Unknown time zone: Mars/Base", json(response).get("error").getAsString());
    }

    private static final String P256DH = VapidKeys.generate().applicationServerKey();

    @Test
    void refusesAPushSubscriptionWithBrokenKeys() throws IOException, InterruptedException {
        String token = pair();

        HttpResponse<String> response =
                call(
                        "PUT",
                        "/api/devices/me/push",
                        token,
                        "{\"endpoint\":\"https://fcm.googleapis.com/fcm/send/abc\","
                                + "\"keys\":{\"p256dh\":\"BKey\",\"auth\":\"secret\"}}");

        assertEquals(400, response.statusCode());
        assertEquals("Invalid push key p256dh", json(response).get("error").getAsString());
    }

    @Test
    void refusesAPushKeyOffTheCurve() throws IOException, InterruptedException {
        String token = pair();
        byte[] point = Base64Url.decode(P256DH);
        point[64] ^= 1;

        HttpResponse<String> response =
                call(
                        "PUT",
                        "/api/devices/me/push",
                        token,
                        "{\"endpoint\":\"https://fcm.googleapis.com/fcm/send/abc\","
                                + "\"keys\":{\"p256dh\":\""
                                + Base64Url.encode(point)
                                + "\",\"auth\":\"BTBZMqHH6r4Tts7J_aSIgg\"}}");

        assertEquals(400, response.statusCode());
        assertEquals("Invalid push key p256dh", json(response).get("error").getAsString());
    }

    @Test
    void storesThePushSubscription() throws IOException, InterruptedException {
        String token = pair();

        HttpResponse<String> response =
                call(
                        "PUT",
                        "/api/devices/me/push",
                        token,
                        "{\"endpoint\":\"https://fcm.googleapis.com/fcm/send/abc\","
                                + "\"expirationTime\":null,"
                                + "\"keys\":{\"p256dh\":\""
                                + P256DH
                                + "\",\"auth\":\"BTBZMqHH6r4Tts7J_aSIgg\"}}");

        assertEquals(204, response.statusCode(), response.body());
        PushSubscription push = tidings.store().devices().get(0).push();
        assertEquals(URI.create("https://fcm.googleapis.com/fcm/send/abc"), push.endpoint());
        assertEquals(P256DH, push.p256dh());
    }

    @Test
    void unpairing() throws IOException, InterruptedException {
        String token = pair();

        assertEquals(204, call("DELETE", "/api/devices/me", token, null).statusCode());
        assertEquals(401, call("GET", "/api/online", token, null).statusCode());
        assertTrue(tidings.store().devices().isEmpty());
    }

    @Test
    void answersCorsPreflights() throws IOException, InterruptedException {
        HttpResponse<String> response = call("OPTIONS", "/api/online", null, null);

        assertEquals(204, response.statusCode());
        assertEquals("*", response.headers().firstValue("access-control-allow-origin").get());
        assertTrue(
                response.headers()
                        .firstValue("access-control-allow-headers")
                        .get()
                        .contains("authorization"));
    }
}
