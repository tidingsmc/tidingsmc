package dev.tidings.core;

import com.google.gson.Gson;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public final class ApiServer implements AutoCloseable {
    private static final Gson GSON = new Gson();
    private static final int THREADS = 16;

    private static final String MAX_REQUEST_SECONDS = "15";

    private final Api api;
    private final String clientHeader;
    private final HttpServer server;
    private final ExecutorService executor;

    public ApiServer(Api api, InetSocketAddress address, String clientHeader) throws IOException {
        this.api = api;
        this.clientHeader = clientHeader == null || clientHeader.isBlank() ? null : clientHeader;
        limitRequestTime();
        AtomicInteger threads = new AtomicInteger();
        ThreadPoolExecutor pool =
                new ThreadPoolExecutor(
                        THREADS,
                        THREADS,
                        1,
                        TimeUnit.MINUTES,
                        new LinkedBlockingQueue<>(),
                        r -> {
                            Thread t = new Thread(r, "Tidings HTTP " + threads.incrementAndGet());
                            t.setDaemon(true);
                            return t;
                        });
        pool.allowCoreThreadTimeOut(true);
        executor = pool;
        server = HttpServer.create(address, 0);
        server.createContext("/", this::handle);
        server.setExecutor(executor);
        server.start();
    }

    private static void limitRequestTime() {
        if (System.getProperty("sun.net.httpserver.maxReqTime") == null) {
            System.setProperty("sun.net.httpserver.maxReqTime", MAX_REQUEST_SECONDS);
        }
    }

    public int port() {
        return server.getAddress().getPort();
    }

    @Override
    public void close() {
        server.stop(0);
        executor.shutdownNow();
    }

    private void handle(HttpExchange exchange) throws IOException {
        try (exchange) {
            Headers headers = exchange.getResponseHeaders();
            headers.set("Access-Control-Allow-Origin", "*");
            if (exchange.getRequestMethod().equals("OPTIONS")) {
                headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE");
                headers.set("Access-Control-Allow-Headers", "authorization, content-type");
                headers.set("Access-Control-Max-Age", "86400");
                headers.set("Access-Control-Allow-Private-Network", "true");
                exchange.sendResponseHeaders(204, -1);
                return;
            }
            byte[] body;
            try (InputStream in = exchange.getRequestBody()) {
                body = in.readNBytes(Api.MAX_BODY_BYTES + 1);
            }
            send(
                    exchange,
                    api.handle(
                            new Api.Request(
                                    exchange.getRequestMethod(),
                                    exchange.getRequestURI().getPath(),
                                    exchange.getRequestHeaders().getFirst("Authorization"),
                                    body,
                                    client(exchange))));
        }
    }

    private static void send(HttpExchange exchange, Api.Response response) throws IOException {
        if (response.body() == null) {
            exchange.sendResponseHeaders(response.status(), -1);
            return;
        }
        byte[] bytes = GSON.toJson(response.body()).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(response.status(), bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    private String client(HttpExchange exchange) {
        InetAddress remote = exchange.getRemoteAddress().getAddress();
        if (clientHeader != null && remote.isLoopbackAddress()) {
            List<String> values = exchange.getRequestHeaders().get(clientHeader);
            if (values != null && !values.isEmpty()) {
                String[] hops = String.join(",", values).split(",");
                String last = hops[hops.length - 1].strip();
                if (!last.isEmpty()) return last;
            }
        }
        return remote.getHostAddress();
    }
}
