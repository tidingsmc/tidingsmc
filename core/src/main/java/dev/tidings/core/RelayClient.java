package dev.tidings.core;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.net.http.WebSocketHandshakeException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.Signature;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Serves the {@link Api} through a relay (the Cloudflare Worker in {@code relay/}), for servers
 * that can't be reached from the internet
 */
public final class RelayClient implements AutoCloseable {
    private static final Logger LOGGER = LoggerFactory.getLogger(RelayClient.class);
    private static final Gson GSON = new Gson();

    static final int PROTOCOL = 1;

    private static final Duration PING_EVERY = Duration.ofSeconds(30);
    private static final Duration SILENCE_LIMIT = Duration.ofSeconds(75);
    private static final Duration MAX_RETRY_DELAY = Duration.ofMinutes(1);

    private static final int WORKERS = 4;

    private static final String SET_OWNER_KEY =
            ": in the Cloudflare dashboard (Workers & Pages, your relay, Settings, Variables and"
                    + " Secrets, a variable of type Secret), or with `npx wrangler secret put"
                    + " OWNER_KEY` in relay/. Tidings connects within a minute once it's set";

    private final Api api;
    private final VapidKeys keys;
    private final URI connectUri;
    private final String host;
    private final Clock clock;

    private static final HttpClient HTTP =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    private final ScheduledExecutorService scheduler;
    private final ExecutorService workers;

    private volatile boolean closed;
    private WebSocket socket;
    private CompletableFuture<?> sending = CompletableFuture.completedFuture(null);
    private Instant lastHeard;
    private Duration retryDelay = Duration.ofSeconds(1);

    private String lastProblem;

    /**
     * Starts connecting right away, and keeps reconnecting until {@link #close}
     *
     * @param relayUrl the relay's address
     */
    public RelayClient(Api api, VapidKeys keys, URI relayUrl) {
        this(api, keys, relayUrl, Clock.systemUTC());
    }

    RelayClient(Api api, VapidKeys keys, URI relayUrl, Clock clock) {
        this.api = api;
        this.keys = keys;
        this.clock = clock;
        String scheme =
                switch (Objects.requireNonNullElse(relayUrl.getScheme(), "")) {
                    case "https" -> "wss";
                    case "http" -> "ws";
                    default ->
                            throw new IllegalArgumentException(
                                    "The relay URL must start with https://");
                };
        if (relayUrl.getRawAuthority() == null || relayUrl.getHost() == null) {
            throw new IllegalArgumentException("The relay URL has no host");
        }
        String path = relayUrl.getPath().replaceAll("/+$", "");
        connectUri = URI.create(scheme + "://" + relayUrl.getRawAuthority() + path + "/connect");
        host = hostOf(relayUrl);
        AtomicInteger threads = new AtomicInteger();
        ThreadFactory daemons =
                r -> {
                    Thread t = new Thread(r, "Tidings relay " + threads.incrementAndGet());
                    t.setDaemon(true);
                    return t;
                };
        scheduler = Executors.newSingleThreadScheduledExecutor(daemons);
        workers = Executors.newFixedThreadPool(WORKERS, daemons);
        scheduler.execute(this::connect);
        scheduler.scheduleAtFixedRate(
                this::ping, PING_EVERY.toMillis(), PING_EVERY.toMillis(), TimeUnit.MILLISECONDS);
    }

    @Override
    public void close() {
        closed = true;
        WebSocket socket;
        synchronized (this) {
            socket = this.socket;
            this.socket = null;
        }
        if (socket != null) socket.sendClose(WebSocket.NORMAL_CLOSURE, "Server stopping");
        scheduler.shutdownNow();
        workers.shutdownNow();
    }

    public synchronized boolean isConnected() {
        return socket != null;
    }

    public synchronized String problem() {
        return socket == null ? lastProblem : null;
    }

    public String host() {
        return host;
    }

    static String hostOf(URI relayUrl) {
        String host = relayUrl.getHost().toLowerCase(Locale.ROOT);
        int port = relayUrl.getPort();
        int defaultPort = "https".equals(relayUrl.getScheme()) ? 443 : 80;
        return port == -1 || port == defaultPort ? host : host + ":" + port;
    }

    static String signedText(String host, long time) {
        return "tidings-relay\n" + host + "\n" + time;
    }

    private void connect() {
        if (closed) return;
        try {
            startConnecting();
        } catch (RuntimeException e) {
            retry(e.toString());
        }
    }

    private void startConnecting() {
        long time = clock.instant().getEpochSecond();
        String signature;
        try {
            Signature signer = Signature.getInstance("SHA256withECDSAinP1363Format");
            signer.initSign(keys.privateKey());
            signer.update(signedText(host, time).getBytes(StandardCharsets.UTF_8));
            signature = Base64Url.encode(signer.sign());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Every JVM has ES256", e);
        }
        HTTP.newWebSocketBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .header("X-Tidings-Protocol", Integer.toString(PROTOCOL))
                .header("X-Tidings-Key", keys.applicationServerKey())
                .header("X-Tidings-Time", Long.toString(time))
                .header("X-Tidings-Signature", signature)
                .buildAsync(connectUri, new Listener())
                .whenComplete(
                        (socket, error) -> {
                            if (error != null) {
                                retry(describe(error));
                                return;
                            }
                            synchronized (this) {
                                if (closed) {
                                    socket.abort();
                                    return;
                                }
                                this.socket = socket;
                                lastHeard = clock.instant();
                                retryDelay = Duration.ofSeconds(1);
                                lastProblem = null;
                            }
                            LOGGER.info("Tidings is connected to its relay {}", host);
                        });
    }

    private String describe(Throwable error) {
        Throwable cause = error.getCause() != null ? error.getCause() : error;
        if (cause instanceof WebSocketHandshakeException handshake) {
            int status = handshake.getResponse().statusCode();
            return switch (status) {
                case 428 ->
                        "the relay isn't set up yet. Set its OWNER_KEY secret to "
                                + keys.applicationServerKey()
                                + SET_OWNER_KEY;
                case 403 ->
                        "the relay belongs to another server. If it's yours and you moved"
                                + " servers or lost tidings/data.json, change its OWNER_KEY"
                                + " secret to "
                                + keys.applicationServerKey()
                                + SET_OWNER_KEY;
                case 401 -> "the relay refused this server's signature; is the clock right?";
                case 426 ->
                        "the relay and the mod don't speak the same version: update both, by"
                                + " redeploying the relay";
                default -> "the relay answered " + status + " instead of accepting the connection";
            };
        }
        return cause.toString();
    }

    private synchronized void retry(String problem) {
        if (closed) return;
        socket = null;
        if (!problem.equals(lastProblem)) {
            LOGGER.warn("Tidings can't reach its relay {}: {}. Retrying.", host, problem);
            lastProblem = problem;
        }
        Duration delay = retryDelay;
        retryDelay = retryDelay.multipliedBy(2);
        if (retryDelay.compareTo(MAX_RETRY_DELAY) > 0) retryDelay = MAX_RETRY_DELAY;
        scheduler.schedule(this::connect, delay.toMillis(), TimeUnit.MILLISECONDS);
    }

    /** Ignores news of a connection already replaced */
    private synchronized void retry(WebSocket from, String problem) {
        if (from == socket) retry(problem);
    }

    private void ping() {
        WebSocket socket;
        synchronized (this) {
            socket = this.socket;
            if (socket == null) return;
            if (Duration.between(lastHeard, clock.instant()).compareTo(SILENCE_LIMIT) > 0) {
                socket.abort();
                retry("the relay stopped answering");
                return;
            }
        }
        send(socket, "ping");
    }

    private synchronized void send(WebSocket socket, String text) {
        sending =
                sending.handle((ok, error) -> null)
                        .thenCompose(nothing -> socket.sendText(text, true));
    }

    /**
     * Answers one request frame from the relay
     *
     * <p>Request: {@code {id, method, path, authorization?, client, body?}}, the body as text.
     * Response: {@code {id, status, body?}}, the body as JSON text
     */
    String answer(String frame) {
        JsonObject request;
        try {
            request = JsonParser.parseString(frame).getAsJsonObject();
        } catch (JsonParseException | IllegalStateException e) {
            LOGGER.warn("Tidings got a frame it doesn't understand from its relay");
            return null;
        }
        String id = Json.string(request, "id");
        String body = optionalString(request, "body");
        Api.Response response =
                api.handle(
                        new Api.Request(
                                Json.string(request, "method"),
                                Json.string(request, "path"),
                                optionalString(request, "authorization"),
                                body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8),
                                Json.string(request, "client")));
        JsonObject reply = new JsonObject();
        reply.addProperty("id", id);
        reply.addProperty("status", response.status());
        if (response.body() != null) reply.addProperty("body", GSON.toJson(response.body()));
        return GSON.toJson(reply);
    }

    private static String optionalString(JsonObject object, String key) {
        JsonElement value = object.get(key);
        return value == null || value.isJsonNull() ? null : value.getAsString();
    }

    private final class Listener implements WebSocket.Listener {
        private final StringBuilder text = new StringBuilder();

        @Override
        public CompletionStage<?> onText(WebSocket socket, CharSequence data, boolean last) {
            synchronized (RelayClient.this) {
                lastHeard = clock.instant();
            }
            text.append(data);
            if (last) {
                String frame = text.toString();
                text.setLength(0);
                if (!frame.equals("pong")) {
                    workers.execute(
                            () -> {
                                String reply;
                                try {
                                    reply = answer(frame);
                                } catch (RuntimeException e) {
                                    LOGGER.warn("Tidings couldn't answer a relayed request", e);
                                    return;
                                }
                                if (reply != null) send(socket, reply);
                            });
                }
            }
            socket.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(WebSocket socket, int status, String reason) {
            retry(
                    socket,
                    "the relay closed the connection"
                            + (reason.isEmpty() ? " (" + status + ")" : ": " + reason));
            return null;
        }

        @Override
        public void onError(WebSocket socket, Throwable error) {
            retry(socket, error.toString());
        }
    }
}
