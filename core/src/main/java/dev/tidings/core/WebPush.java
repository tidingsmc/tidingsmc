package dev.tidings.core;

import com.google.gson.JsonObject;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.InvalidKeyException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECFieldFp;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Sends pushes straight to the browsers' push services (RFC 8030): encrypted for the device (RFC
 * 8291, aes128gcm) and signed with the server's VAPID key (RFC 8292)
 */
public final class WebPush implements PushSender, AutoCloseable {
    private static final Logger LOGGER = LoggerFactory.getLogger(WebPush.class);
    private static final int THREADS = 4;

    /** The largest payload every push service must accept (RFC 8291 section 4) */
    static final int MAX_PAYLOAD = 3993;

    /** Payloads always fit in one record of this size */
    private static final int RECORD_SIZE = 4096;

    private static final Duration JWT_LIFETIME = Duration.ofHours(12);

    private static final ECParameterSpec P256 = p256();

    /**
     * How long a push may take, from encrypting it to the push service's answer. Short enough for
     * the game to wait for the "server stopping" pushes before it exits
     */
    public static final Duration TIMEOUT = Duration.ofSeconds(4);

    /**
     * Shared by every instance: Java 17 can't close an HttpClient, so one per server start would
     * keep its threads and connections around until it's garbage collected
     */
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();

    private final VapidKeys keys;
    private final String subject;
    private final Clock clock;
    private final ExecutorService executor;

    /**
     * @param subject how push services can reach the server's owner: an https: or mailto: URL
     */
    public WebPush(VapidKeys keys, String subject) {
        this(keys, subject, Clock.systemUTC());
    }

    WebPush(VapidKeys keys, String subject, Clock clock) {
        this.keys = keys;
        this.subject = subject;
        this.clock = clock;
        AtomicInteger threads = new AtomicInteger();
        ThreadPoolExecutor pool =
                new ThreadPoolExecutor(
                        THREADS,
                        THREADS,
                        1,
                        TimeUnit.MINUTES,
                        new LinkedBlockingQueue<>(),
                        r -> {
                            Thread t = new Thread(r, "Tidings push " + threads.incrementAndGet());
                            t.setDaemon(true);
                            return t;
                        });
        pool.allowCoreThreadTimeOut(true);
        executor = pool;
    }

    @Override
    public void close() {
        executor.shutdown();
    }

    @Override
    public CompletableFuture<Result> send(
            PushSubscription to, byte[] payload, Duration ttl, String topic) {
        String host = to.endpoint().getHost();
        CompletableFuture<Result> sent;
        try {
            sent =
                    CompletableFuture.supplyAsync(() -> request(to, payload, ttl, topic), executor)
                            .thenCompose(
                                    request -> HTTP.sendAsync(request, BodyHandlers.ofString()))
                            .thenApply(response -> result(host, response))
                            .orTimeout(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
        } catch (RejectedExecutionException e) {
            LOGGER.warn("Push to {} not sent: Tidings is shutting down", host);
            return CompletableFuture.completedFuture(Result.FAILED);
        }
        return sent.exceptionally(
                e -> {
                    Throwable cause = e instanceof CompletionException ? e.getCause() : e;
                    LOGGER.warn("Couldn't send a push to {}: {}", host, cause.toString());
                    return Result.FAILED;
                });
    }

    private HttpRequest request(PushSubscription to, byte[] payload, Duration ttl, String topic) {
        byte[] body = encrypt(payload, to.publicKey(), to.authSecret());
        HttpRequest.Builder request =
                HttpRequest.newBuilder(to.endpoint())
                        .timeout(TIMEOUT)
                        .header(
                                "Authorization",
                                "vapid t="
                                        + jwt(audience(to.endpoint()))
                                        + ", k="
                                        + keys.applicationServerKey())
                        .header("TTL", Long.toString(ttl.toSeconds()))
                        .header("Urgency", "high")
                        .header("Content-Encoding", "aes128gcm")
                        .header("Content-Type", "application/octet-stream")
                        .POST(BodyPublishers.ofByteArray(body));
        if (topic != null) request.header("Topic", topic);
        return request.build();
    }

    private static Result result(String host, HttpResponse<String> response) {
        Result result = resultOf(response.statusCode());
        if (result == Result.FAILED) {
            String body = response.body();
            LOGGER.warn(
                    "Push service {} refused a push: {} {}",
                    host,
                    response.statusCode(),
                    body.length() > 200 ? body.substring(0, 200) + "…" : body);
        }
        return result;
    }

    static Result resultOf(int status) {
        if (status >= 200 && status < 300) return Result.DELIVERED;
        if (status == 404 || status == 410) return Result.GONE;
        return Result.FAILED;
    }

    /** The endpoint's origin, as browsers serialize it: without the default port */
    static String audience(URI endpoint) {
        int port = endpoint.getPort();
        boolean defaultPort = port == -1 || port == 443;
        return endpoint.getScheme() + "://" + endpoint.getHost() + (defaultPort ? "" : ":" + port);
    }

    /** A VAPID token for {@code audience} */
    String jwt(String audience) {
        Instant expiresAt = clock.instant().plus(JWT_LIFETIME);
        JsonObject header = new JsonObject();
        header.addProperty("typ", "JWT");
        header.addProperty("alg", "ES256");
        JsonObject claims = new JsonObject();
        claims.addProperty("aud", audience);
        claims.addProperty("exp", expiresAt.getEpochSecond());
        claims.addProperty("sub", subject);
        String unsigned = base64Url(header.toString()) + "." + base64Url(claims.toString());
        try {
            // JWTs want the bare r and s, not the DER encoding Java uses by default
            Signature es256 = Signature.getInstance("SHA256withECDSAinP1363Format");
            es256.initSign(keys.privateKey());
            es256.update(unsigned.getBytes(StandardCharsets.US_ASCII));
            return unsigned + "." + Base64Url.encode(es256.sign());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Couldn't sign a VAPID token", e);
        }
    }

    private static byte[] encrypt(byte[] payload, byte[] uaPublic, byte[] authSecret) {
        VapidKeys ephemeral = VapidKeys.generate();
        byte[] salt = new byte[16];
        Tokens.RANDOM.nextBytes(salt);
        return encrypt(
                payload,
                uaPublic,
                authSecret,
                new KeyPair(ephemeral.publicKey(), ephemeral.privateKey()),
                salt);
    }

    /**
     * The push's body as RFC 8291 defines it, in a single record
     *
     * @param uaPublic the device's public key (p256dh)
     * @param asKeys a key pair used for this push only
     */
    static byte[] encrypt(
            byte[] payload, byte[] uaPublic, byte[] authSecret, KeyPair asKeys, byte[] salt) {
        if (payload.length > MAX_PAYLOAD) {
            throw new IllegalArgumentException(
                    "Push payload too large: " + payload.length + " bytes");
        }
        try {
            KeyAgreement ecdh = KeyAgreement.getInstance("ECDH");
            ecdh.init(asKeys.getPrivate());
            ecdh.doPhase(publicKey(uaPublic), true);
            byte[] ecdhSecret = ecdh.generateSecret();
            byte[] asPublic = VapidKeys.uncompressed((ECPublicKey) asKeys.getPublic());

            byte[] prkKey = hmac(authSecret, ecdhSecret);
            byte[] ikm =
                    hmac(
                            prkKey,
                            concat(ascii("WebPush: info\0"), uaPublic, asPublic, new byte[] {1}));
            byte[] prk = hmac(salt, ikm);
            byte[] cek = Arrays.copyOf(hmac(prk, ascii("Content-Encoding: aes128gcm\0\1")), 16);
            byte[] nonce = Arrays.copyOf(hmac(prk, ascii("Content-Encoding: nonce\0\1")), 12);

            Cipher aes = Cipher.getInstance("AES/GCM/NoPadding");
            aes.init(
                    Cipher.ENCRYPT_MODE,
                    new SecretKeySpec(cek, "AES"),
                    new GCMParameterSpec(128, nonce));
            byte[] ciphertext = aes.doFinal(concat(payload, new byte[] {2}));

            return ByteBuffer.allocate(16 + 4 + 1 + asPublic.length + ciphertext.length)
                    .put(salt)
                    .putInt(RECORD_SIZE)
                    .put((byte) asPublic.length)
                    .put(asPublic)
                    .put(ciphertext)
                    .array();
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException(
                    "Couldn't encrypt for this device: " + e.getMessage(), e);
        }
    }

    static ECPublicKey publicKey(byte[] point) throws GeneralSecurityException {
        if (point.length != 65 || point[0] != 4) {
            throw new InvalidKeyException("Not an uncompressed P-256 point");
        }
        BigInteger x = new BigInteger(1, Arrays.copyOfRange(point, 1, 33));
        BigInteger y = new BigInteger(1, Arrays.copyOfRange(point, 33, 65));
        BigInteger p = ((ECFieldFp) P256.getCurve().getField()).getP();
        BigInteger a = P256.getCurve().getA();
        BigInteger b = P256.getCurve().getB();
        if (x.compareTo(p) >= 0
                || y.compareTo(p) >= 0
                || !y.pow(2).mod(p).equals(x.pow(3).add(a.multiply(x)).add(b).mod(p))) {
            throw new InvalidKeyException("Not a point on P-256");
        }
        ECPoint w = new ECPoint(x, y);
        return (ECPublicKey)
                KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(w, P256));
    }

    static ECParameterSpec p256() {
        try {
            AlgorithmParameters params = AlgorithmParameters.getInstance("EC");
            params.init(new ECGenParameterSpec("secp256r1"));
            return params.getParameterSpec(ECParameterSpec.class);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Every JVM has P-256", e);
        }
    }

    private static byte[] hmac(byte[] key, byte[] data) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data);
    }

    private static byte[] ascii(String s) {
        return s.getBytes(StandardCharsets.US_ASCII);
    }

    private static byte[] concat(byte[]... parts) {
        ByteBuffer buffer = ByteBuffer.allocate(Arrays.stream(parts).mapToInt(p -> p.length).sum());
        for (byte[] part : parts) buffer.put(part);
        return buffer.array();
    }

    private static String base64Url(String s) {
        return Base64Url.encode(s.getBytes(StandardCharsets.UTF_8));
    }
}
