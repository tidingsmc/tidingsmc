package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.time.Instant;
import java.util.UUID;

class RelayClientTest {
    private final PlayerProfile steve = new PlayerProfile(UUID.randomUUID(), "Steve", null);
    private final Tidings tidings = new Tidings(Store.inMemory(), new FakeGame());

    /** Nothing listens there: it keeps retrying in the background, which these tests ignore. */
    private final RelayClient relay =
            new RelayClient(
                    new Api(tidings),
                    tidings.store().vapidKeys(),
                    URI.create("http://127.0.0.1:9/"));

    @AfterEach
    void stop() {
        relay.close();
    }

    private static JsonObject json(String text) {
        return JsonParser.parseString(text).getAsJsonObject();
    }

    @Test
    void answersAPairingRequest() {
        String code = tidings.startPairing(steve, Instant.now()).orElseThrow();
        JsonObject request = new JsonObject();
        request.addProperty("id", "r1");
        request.addProperty("method", "POST");
        request.addProperty("path", "/api/pair");
        request.addProperty("client", "203.0.113.7");
        request.addProperty("body", "{\"code\":\"" + code + "\",\"deviceName\":\"Pixel\"}");

        JsonObject reply = json(relay.answer(request.toString()));

        assertEquals("r1", reply.get("id").getAsString());
        assertEquals(200, reply.get("status").getAsInt());
        JsonObject body = json(reply.get("body").getAsString());
        assertEquals(tidings.store().serverId(), body.get("serverId").getAsString());
        assertEquals("Steve", body.getAsJsonObject("player").get("name").getAsString());
    }

    @Test
    void answersErrorsLikeTheHttpServer() {
        JsonObject request = new JsonObject();
        request.addProperty("id", "r2");
        request.addProperty("method", "GET");
        request.addProperty("path", "/api/online");
        request.addProperty("authorization", "Bearer nope");
        request.addProperty("client", "203.0.113.7");

        JsonObject reply = json(relay.answer(request.toString()));

        assertEquals(401, reply.get("status").getAsInt());
        assertEquals("unpaired", json(reply.get("body").getAsString()).get("reason").getAsString());
    }

    @Test
    void noContentHasNoBody() {
        String code = tidings.startPairing(steve, Instant.now()).orElseThrow();
        JsonObject pair = new JsonObject();
        pair.addProperty("id", "a");
        pair.addProperty("method", "POST");
        pair.addProperty("path", "/api/pair");
        pair.addProperty("client", "203.0.113.7");
        pair.addProperty("body", "{\"code\":\"" + code + "\"}");
        String token =
                json(json(relay.answer(pair.toString())).get("body").getAsString())
                        .get("token")
                        .getAsString();
        JsonObject withdraw = new JsonObject();
        withdraw.addProperty("id", "b");
        withdraw.addProperty("method", "DELETE");
        withdraw.addProperty("path", "/api/devices/me");
        withdraw.addProperty("authorization", "Bearer " + token);
        withdraw.addProperty("client", "203.0.113.7");

        JsonObject reply = json(relay.answer(withdraw.toString()));

        assertEquals(204, reply.get("status").getAsInt());
        assertFalse(reply.has("body"));
    }

    @Test
    void ignoresGarbage() {
        assertNull(relay.answer("not json"));
    }
}
