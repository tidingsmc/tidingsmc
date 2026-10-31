package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpServer;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

class DoctorTest {
    private final Tidings tidings = new Tidings(Store.inMemory(), new FakeGame());
    private final List<AutoCloseable> servers = new ArrayList<>();

    private ApiServer api;

    /** Serves the app: a page, and its service worker next to it. */
    private HttpServer app;

    /** Answers 404 to anything, like a push service to a GET, with its Date. */
    private HttpServer push;

    @BeforeEach
    void start() throws IOException {
        api =
                new ApiServer(
                        new Api(tidings),
                        new InetSocketAddress(InetAddress.getLoopbackAddress(), 0),
                        null);
        servers.add(api);

        app = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        app.createContext(
                "/",
                exchange -> {
                    String path = exchange.getRequestURI().getPath();
                    int status =
                            // Like hosts that don't redirect to the trailing slash.
                            path.equals("/tidings")
                                            || path.equals("/tidings/")
                                            || path.equals("/tidings/sw.js")
                                    ? 200
                                    : 404;
                    exchange.sendResponseHeaders(status, -1);
                    exchange.close();
                });
        app.start();
        servers.add(() -> app.stop(0));

        push = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        push.createContext(
                "/",
                exchange -> {
                    exchange.getResponseHeaders()
                            .set(
                                    "Date",
                                    DateTimeFormatter.RFC_1123_DATE_TIME.format(
                                            Instant.now().atOffset(ZoneOffset.UTC)));
                    exchange.sendResponseHeaders(404, -1);
                    exchange.close();
                });
        push.start();
        servers.add(() -> push.stop(0));
    }

    @AfterEach
    void stop() throws Exception {
        for (AutoCloseable server : servers) server.close();
    }

    private URI apiUrl() {
        return URI.create("http://127.0.0.1:" + api.port());
    }

    private URI appUrl() {
        return URI.create("http://127.0.0.1:" + app.getAddress().getPort() + "/tidings/");
    }

    private Map<String, URI> pushServices() {
        Map<String, URI> services = new LinkedHashMap<>();
        services.put("Fake", URI.create("http://127.0.0.1:" + push.getAddress().getPort() + "/"));
        return services;
    }

    private static Doctor.Verdict verdictOf(List<Doctor.Finding> findings, String text) {
        return findings.stream()
                .filter(f -> f.text().contains(text))
                .findFirst()
                .orElseThrow(() -> new AssertionError("No finding about " + text + ": " + findings))
                .verdict();
    }

    private List<Doctor.Finding> examine(
            Doctor doctor, URI publicUrl, URI appUrl, List<Device> devices) {
        return doctor.examine(publicUrl, appUrl, null, devices).join();
    }

    @Test
    void findsAHealthySetup() {
        List<Doctor.Finding> findings =
                examine(
                        new Doctor(Clock.systemUTC(), pushServices()),
                        apiUrl(),
                        appUrl(),
                        List.of());

        assertEquals(Doctor.Verdict.OK, verdictOf(findings, "Phones reach the API"));
        assertEquals(Doctor.Verdict.OK, verdictOf(findings, "Pairing links open the app"));
        assertEquals(Doctor.Verdict.OK, verdictOf(findings, "Reached the push services: Fake"));
        assertEquals(Doctor.Verdict.OK, verdictOf(findings, "clock is right"));
        // Tests run on localhost.
        assertEquals(Doctor.Verdict.WARNING, verdictOf(findings, "only reachable from this"));
        assertTrue(findings.stream().noneMatch(f -> f.verdict() == Doctor.Verdict.PROBLEM));
    }

    @Test
    void noticesAPublicUrlLeadingElsewhere() {
        URI notTheApi = URI.create("http://127.0.0.1:" + app.getAddress().getPort());

        List<Doctor.Finding> findings =
                examine(
                        new Doctor(Clock.systemUTC(), pushServices()),
                        notTheApi,
                        appUrl(),
                        List.of());

        assertEquals(Doctor.Verdict.PROBLEM, verdictOf(findings, "instead of Tidings' API"));
    }

    @Test
    void findsTheAppWithoutItsTrailingSlash() {
        URI noSlash = URI.create("http://127.0.0.1:" + app.getAddress().getPort() + "/tidings");

        List<Doctor.Finding> findings =
                examine(
                        new Doctor(Clock.systemUTC(), pushServices()),
                        apiUrl(),
                        noSlash,
                        List.of());

        assertEquals(Doctor.Verdict.OK, verdictOf(findings, "Pairing links open the app"));
    }

    @Test
    void namesAnAddressThatDoesNotResolve() {
        List<Doctor.Finding> findings =
                examine(
                        new Doctor(Clock.systemUTC(), pushServices()),
                        URI.create("https://tidings.invalid"),
                        appUrl(),
                        List.of());

        assertEquals(Doctor.Verdict.PROBLEM, verdictOf(findings, "its name doesn't resolve"));
    }

    @Test
    void noticesAnAppUrlThatIsNotTheApp() {
        URI elsewhere = URI.create("http://127.0.0.1:" + app.getAddress().getPort() + "/other/");

        List<Doctor.Finding> findings =
                examine(
                        new Doctor(Clock.systemUTC(), pushServices()),
                        apiUrl(),
                        elsewhere,
                        List.of());

        assertEquals(Doctor.Verdict.PROBLEM, verdictOf(findings, "doesn't look like the Tidings"));
    }

    @Test
    void noticesAClockThatIsOff() {
        Clock ahead = Clock.offset(Clock.systemUTC(), Duration.ofMinutes(20));

        List<Doctor.Finding> findings =
                examine(new Doctor(ahead, pushServices()), apiUrl(), appUrl(), List.of());

        assertEquals(Doctor.Verdict.PROBLEM, verdictOf(findings, "clock is 20 minutes ahead"));
    }

    @Test
    void anUnreachablePushServiceMattersMostWhenADeviceUsesIt() throws Exception {
        try (ServerSocket hangUp = hangUpServer()) {
            Map<String, URI> services = new LinkedHashMap<>();
            URI dead = URI.create("http://127.0.0.1:" + hangUp.getLocalPort() + "/");
            services.put("Dead", dead);
            Doctor doctor = new Doctor(Clock.systemUTC(), services);

            assertEquals(
                    Doctor.Verdict.WARNING,
                    verdictOf(examine(doctor, apiUrl(), appUrl(), List.of()), "Can't reach Dead"));

            PlayerProfile steve = new PlayerProfile(UUID.randomUUID(), "Steve", null);
            Device usingIt =
                    new Device(
                            "pixel",
                            "hash",
                            "Pixel",
                            steve,
                            Instant.EPOCH,
                            DeviceSettings.defaults(),
                            new PushSubscription(
                                    URI.create("https://127.0.0.1/push/abc"),
                                    VapidKeys.generate().applicationServerKey(),
                                    "BTBZMqHH6r4Tts7J_aSIgg"));
            assertEquals(
                    Doctor.Verdict.PROBLEM,
                    verdictOf(
                            examine(doctor, apiUrl(), appUrl(), List.of(usingIt)),
                            "Can't reach Dead"));
        }
    }

    @Test
    void listsDevicesWithoutNotifications() {
        PlayerProfile steve = new PlayerProfile(UUID.randomUUID(), "Steve", null);
        Device device =
                new Device(
                        "pixel",
                        "hash",
                        "Pixel",
                        steve,
                        Instant.EPOCH,
                        DeviceSettings.defaults(),
                        null);

        List<Doctor.Finding> findings =
                examine(
                        new Doctor(Clock.systemUTC(), pushServices()),
                        apiUrl(),
                        appUrl(),
                        List.of(device));

        assertEquals(Doctor.Verdict.WARNING, verdictOf(findings, "Steve's Pixel"));
    }

    /** Hangs up on every connection: fails right away, where a closed port may time out. */
    static ServerSocket hangUpServer() throws IOException {
        ServerSocket socket = new ServerSocket(0, 50, InetAddress.getLoopbackAddress());
        Thread accepting =
                new Thread(
                        () -> {
                            while (!socket.isClosed()) {
                                try {
                                    socket.accept().close();
                                } catch (IOException e) {
                                    return;
                                }
                            }
                        });
        accepting.setDaemon(true);
        accepting.start();
        return socket;
    }
}
