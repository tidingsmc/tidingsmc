package dev.tidings.core;

import java.io.IOException;
import java.net.ConnectException;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.net.http.HttpTimeoutException;
import java.nio.channels.UnresolvedAddressException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

import javax.net.ssl.SSLException;

public final class Doctor {
    public enum Verdict {
        OK,
        WARNING,
        PROBLEM
    }

    public record Finding(Verdict verdict, String text) {}
    private static final Map<String, URI> PUSH_SERVICES = new LinkedHashMap<>();

    static {
        PUSH_SERVICES.put("Google's (Chrome, Android)", URI.create("https://fcm.googleapis.com/"));
        PUSH_SERVICES.put(
                "Mozilla's (Firefox)", URI.create("https://updates.push.services.mozilla.com/"));
        PUSH_SERVICES.put("Apple's (Safari, iPhone)", URI.create("https://web.push.apple.com/"));
    }

    static final Duration TIMEOUT = Duration.ofSeconds(8);
    static final Duration MAX_CLOCK_SKEW = Duration.ofMinutes(5);

    private static final HttpClient HTTP =
            HttpClient.newBuilder()
                    .connectTimeout(TIMEOUT)
                    .followRedirects(HttpClient.Redirect.NORMAL)
                    .build();

    private final Clock clock;
    private final Map<String, URI> pushServices;

    public Doctor() {
        this(Clock.systemUTC(), PUSH_SERVICES);
    }

    Doctor(Clock clock, Map<String, URI> pushServices) {
        this.clock = clock;
        this.pushServices = pushServices;
    }

    public CompletableFuture<List<Finding>> examine(
            URI publicUrl, URI appUrl, RelayClient relay, List<Device> devices) {
        CompletableFuture<List<Finding>> api = api(publicUrl, appUrl);
        CompletableFuture<List<Finding>> app = app(appUrl);
        CompletableFuture<List<Finding>> push = pushServices(devices);
        return CompletableFuture.allOf(api, app, push)
                .thenApply(
                        nothing -> {
                            List<Finding> findings = new ArrayList<>();
                            if (relay != null) findings.add(relay(relay));
                            findings.addAll(api.join());
                            findings.addAll(app.join());
                            findings.addAll(push.join());
                            findings.addAll(devices(devices));
                            return findings;
                        });
    }

    private static Finding relay(RelayClient relay) {
        if (relay.isConnected()) {
            return new Finding(Verdict.OK, "Connected to the relay " + relay.host() + ".");
        }
        String problem = relay.problem();
        return new Finding(
                Verdict.PROBLEM,
                "Not connected to the relay "
                        + relay.host()
                        + (problem == null ? ": still trying." : ": " + problem + "."));
    }

    private CompletableFuture<List<Finding>> api(URI publicUrl, URI appUrl) {
        List<Finding> findings = new ArrayList<>();
        if (isLocal(publicUrl)) {
            findings.add(
                    new Finding(
                            Verdict.WARNING,
                            publicUrl
                                    + " is only reachable from this computer: fine for testing,"
                                    + " otherwise set relay-url or public-url."));
        } else if (!"https".equals(publicUrl.getScheme())) {
            findings.add(
                    new Finding(
                            Verdict.PROBLEM,
                            publicUrl
                                    + " isn't HTTPS: the app can't call it. Put it behind HTTPS,"
                                    + " or use a relay."));
        }
        HttpRequest request =
                HttpRequest.newBuilder(withPath(publicUrl, "/api/info"))
                        .timeout(TIMEOUT)
                        .header("Origin", origin(appUrl))
                        .GET()
                        .build();
        return HTTP.sendAsync(request, BodyHandlers.discarding())
                .handle(
                        (response, error) -> {
                            findings.add(apiFinding(publicUrl, response, error));
                            return findings;
                        });
    }

    private static Finding apiFinding(URI url, HttpResponse<?> response, Throwable error) {
        if (error != null) {
            return new Finding(Verdict.PROBLEM, "Phones can't reach " + url + ": " + why(error));
        }
        int status = response.statusCode();
        if (status == 401) {
            if (response.headers().firstValue("Access-Control-Allow-Origin").isEmpty()) {
                return new Finding(
                        Verdict.PROBLEM,
                        url
                                + " answers without the Access-Control-Allow-Origin header, so the"
                                + " app can't read its answers: does a proxy in front of the mod"
                                + " drop it?");
            }
            return new Finding(Verdict.OK, "Phones reach the API at " + url + ".");
        }
        if (status == 502 || status == 504) {
            return new Finding(
                    Verdict.PROBLEM,
                    url
                            + " answers "
                            + status
                            + ": what's in front of the mod (relay, tunnel or proxy) can't reach"
                            + " it.");
        }
        return new Finding(
                Verdict.PROBLEM,
                url
                        + " answers "
                        + status
                        + " instead of Tidings' API: does it lead to the mod's port?");
    }

    private CompletableFuture<List<Finding>> app(URI appUrl) {
        if (!isLocal(appUrl) && !"https".equals(appUrl.getScheme())) {
            return CompletableFuture.completedFuture(
                    List.of(
                            new Finding(
                                    Verdict.PROBLEM,
                                    "app-url "
                                            + appUrl
                                            + " isn't HTTPS: phones can't get notifications or"
                                            + " scan codes from it.")));
        }
        return get(appUrl)
                .thenCompose(
                        page -> {
                            if (page.statusCode() != 200) {
                                return CompletableFuture.completedFuture(
                                        notTheApp(appUrl, "it answers " + page.statusCode()));
                            }
                            return get(nextTo(page.uri(), "sw.js"))
                                    .thenApply(
                                            worker ->
                                                    worker.statusCode() == 200
                                                            ? new Finding(
                                                                    Verdict.OK,
                                                                    "Pairing links open the app at "
                                                                            + appUrl
                                                                            + ".")
                                                            : notTheApp(
                                                                    appUrl,
                                                                    "it has no sw.js next to"
                                                                            + " the page"));
                        })
                .handle(
                        (finding, error) ->
                                List.of(
                                        error == null
                                                ? finding
                                                : new Finding(
                                                        Verdict.PROBLEM,
                                                        "Can't reach the app at "
                                                                + appUrl
                                                                + ": "
                                                                + why(error))));
    }

    private static Finding notTheApp(URI appUrl, String why) {
        return new Finding(
                Verdict.PROBLEM,
                "app-url " + appUrl + " doesn't look like the Tidings app: " + why + ".");
    }

    private CompletableFuture<List<Finding>> pushServices(List<Device> devices) {
        Map<String, CompletableFuture<HttpResponse<Void>>> answers = new LinkedHashMap<>();
        pushServices.forEach((name, url) -> answers.put(name, get(url)));
        return CompletableFuture.allOf(
                        answers.values().stream()
                                .map(answer -> answer.handle((ok, error) -> null))
                                .toArray(CompletableFuture[]::new))
                .thenApply(
                        nothing -> {
                            Instant now = clock.instant();
                            List<Finding> findings = new ArrayList<>();
                            List<String> reached = new ArrayList<>();
                            Duration skew = null;
                            for (var entry : answers.entrySet()) {
                                String name = entry.getKey();
                                URI url = pushServices.get(name);
                                try {
                                    HttpResponse<Void> response = entry.getValue().join();
                                    reached.add(name);
                                    if (skew == null) skew = skew(response, now).orElse(null);
                                } catch (CompletionException e) {
                                    boolean used = usedBy(url, devices);
                                    findings.add(
                                            new Finding(
                                                    used ? Verdict.PROBLEM : Verdict.WARNING,
                                                    "Can't reach "
                                                            + name
                                                            + " push service: "
                                                            + why(e)
                                                            + (used
                                                                    ? " Phones using it get no"
                                                                            + " notifications."
                                                                    : " No paired phone uses it"
                                                                            + " yet.")));
                                }
                            }
                            if (!reached.isEmpty()) {
                                findings.add(
                                        0,
                                        new Finding(
                                                Verdict.OK,
                                                "Reached the push services: "
                                                        + String.join(", ", reached)
                                                        + "."));
                            }
                            if (skew != null) findings.add(clockFinding(skew));
                            return findings;
                        });
    }

    private static boolean usedBy(URI service, List<Device> devices) {
        return devices.stream()
                .anyMatch(
                        d ->
                                d.push() != null
                                        && Objects.equals(
                                                d.push().endpoint().getHost(), service.getHost()));
    }

    /** How far ahead of this server's clock {@code response}'s Date is */
    private static Optional<Duration> skew(HttpResponse<?> response, Instant now) {
        return response.headers()
                .firstValue("Date")
                .flatMap(
                        date -> {
                            try {
                                Instant theirs =
                                        ZonedDateTime.parse(
                                                        date, DateTimeFormatter.RFC_1123_DATE_TIME)
                                                .toInstant();
                                return Optional.of(Duration.between(now, theirs));
                            } catch (DateTimeParseException e) {
                                return Optional.empty();
                            }
                        });
    }

    private static Finding clockFinding(Duration skew) {
        Duration off = skew.abs();
        if (off.compareTo(MAX_CLOCK_SKEW) <= 0) {
            return new Finding(Verdict.OK, "This server's clock is right.");
        }
        return new Finding(
                Verdict.PROBLEM,
                "This server's clock is "
                        + off.toMinutes()
                        + " minutes "
                        + (skew.isNegative() ? "ahead" : "behind")
                        + ": the relay and push services refuse what it signs. Sync it, with NTP.");
    }

    private static List<Finding> devices(List<Device> devices) {
        List<String> withoutPush =
                devices.stream()
                        .filter(d -> d.push() == null)
                        .map(d -> d.player().name() + "'s " + d.name())
                        .toList();
        if (withoutPush.isEmpty()) return List.of();
        return List.of(
                new Finding(
                        Verdict.WARNING,
                        "Never set up notifications, so they get none: "
                                + String.join(", ", withoutPush)
                                + ". Their players can turn them on in the app."));
    }

    private static CompletableFuture<HttpResponse<Void>> get(URI url) {
        return HTTP.sendAsync(
                HttpRequest.newBuilder(url).timeout(TIMEOUT).GET().build(),
                BodyHandlers.discarding());
    }

    private static String why(Throwable error) {
        Throwable cause = error;
        while (cause instanceof CompletionException && cause.getCause() != null) {
            cause = cause.getCause();
        }
        if (cause instanceof HttpConnectTimeoutException || cause instanceof HttpTimeoutException) {
            return "no answer within " + TIMEOUT.toSeconds() + " seconds.";
        }
        for (Throwable c = cause; c != null; c = c.getCause()) {
            if (c instanceof UnknownHostException || c instanceof UnresolvedAddressException) {
                return "its name doesn't resolve.";
            }
        }
        if (cause instanceof ConnectException) {
            String reason = null;
            for (Throwable c = cause; c != null; c = c.getCause()) {
                if (c.getMessage() != null) reason = c.getMessage();
            }
            if (reason == null) return "it can't be reached.";
            if (reason.contains("refused")) return "the connection was refused.";
            return "it can't be reached (" + reason + ").";
        }
        if (cause instanceof SSLException) return "its HTTPS certificate isn't valid.";
        if (cause instanceof IOException && cause.getMessage() != null) {
            return cause.getMessage() + ".";
        }
        return cause + ".";
    }

    private static boolean isLocal(URI url) {
        String host = Objects.requireNonNullElse(url.getHost(), "");
        return host.equals("localhost") || host.startsWith("127.") || host.equals("[::1]");
    }

    /**
     * {@code file} in the same folder as the page at {@code page}. Hosts that don't redirect to the
     * folder's trailing slash serve it at .../tidings too
     */
    static URI nextTo(URI page, String file) {
        String path = Objects.requireNonNullElse(page.getPath(), "");
        String last = path.substring(path.lastIndexOf('/') + 1);
        if (!last.isEmpty() && !last.contains(".")) page = withPath(page, "/");
        return page.resolve(file);
    }

    private static URI withPath(URI url, String path) {
        return URI.create(url.toString().replaceAll("/+$", "") + path);
    }

    private static String origin(URI url) {
        int port = url.getPort();
        return url.getScheme() + "://" + url.getHost() + (port == -1 ? "" : ":" + port);
    }
}
