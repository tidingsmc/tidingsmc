package dev.tidings.core;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;
import java.util.function.Predicate;

/**
 * Pairing codes: single-use, valid for {@link #CODE_LIFETIME}, at most one per player. Each comes
 * in two forms that redeem the same pairing: 6 digits to type, rate-limited since they can be
 * guessed, and a token too long to guess for the QR code, which the rate limit never blocks.
 */
public final class Pairing {
    public static final Duration CODE_LIFETIME = Duration.ofMinutes(5);
    static final int MAX_FAILURES = 10;
    static final int MAX_FAILURES_OVERALL = 60;
    static final Duration FAILURE_WINDOW = Duration.ofMinutes(1);

    /** Random bytes in a token: 128 bits, and short enough to keep the QR code easy to scan. */
    private static final int TOKEN_BYTES = 16;

    private final Random random;

    /** By 6-digit code. */
    private final Map<String, Pending> codes = new HashMap<>();

    /** The 6-digit code of each token. */
    private final Map<String, String> codesByToken = new HashMap<>();

    private final Map<String, Deque<Instant>> failuresByClient = new HashMap<>();

    private final Deque<Instant> failures = new ArrayDeque<>();

    private record Pending(PlayerProfile player, String token, Instant expiresAt) {}

    /** A pairing code in its two forms: {@code code} to type, {@code token} for the QR code. */
    public record Issued(String code, String token) {}

    public Pairing() {
        this(new SecureRandom());
    }

    Pairing(Random random) {
        this.random = random;
    }

    public sealed interface Redemption {
        record Paired(PlayerProfile player) implements Redemption {}

        record Invalid() implements Redemption {}

        record TooManyAttempts() implements Redemption {}

        record Refused() implements Redemption {}
    }

    /** A new code for {@code player}, their previous one stops working. */
    public synchronized Issued issue(PlayerProfile player, Instant now) {
        codes.values().removeIf(p -> p.player.id().equals(player.id()) || expired(p, now));
        codesByToken.values().retainAll(codes.keySet());
        String code;
        do {
            code = String.format("%06d", random.nextInt(1_000_000));
        } while (codes.containsKey(code));
        byte[] bytes = new byte[TOKEN_BYTES];
        random.nextBytes(bytes);
        String token = Base64Url.encode(bytes);
        codes.put(code, new Pending(player, token, now.plus(CODE_LIFETIME)));
        codesByToken.put(token, code);
        return new Issued(code, token);
    }

    /**
     * Uses up {@code code} if {@code pair} accepts its player. {@code pair} runs while no one else
     * can redeem the code; if it returns false or throws, the code stays valid.
     *
     * @param code either form of the code
     * @param client who is guessing, such as their IP address, for the rate limit
     */
    public synchronized Redemption redeem(
            String code, String client, Instant now, Predicate<PlayerProfile> pair) {
        String key = code == null ? null : code.strip();
        String byToken = key == null ? null : codesByToken.get(key);
        // Can't be guessed: even while someone floods wrong codes, the QR code still works.
        if (byToken != null) {
            Pending pending = codes.get(byToken);
            if (expired(pending, now)) {
                remove(byToken);
                return new Redemption.Invalid();
            }
            return use(byToken, pending, pair);
        }

        forgetOld(failures, now);
        failuresByClient.values().removeIf(f -> forgetOld(f, now).isEmpty());
        Deque<Instant> clientFailures = failuresByClient.getOrDefault(client, new ArrayDeque<>());
        if (clientFailures.size() >= MAX_FAILURES || failures.size() >= MAX_FAILURES_OVERALL) {
            return new Redemption.TooManyAttempts();
        }

        Pending pending = key == null ? null : codes.get(key);
        if (pending == null || expired(pending, now)) {
            if (pending != null) remove(key);
            failures.addLast(now);
            clientFailures.addLast(now);
            failuresByClient.put(client, clientFailures);
            return new Redemption.Invalid();
        }
        return use(key, pending, pair);
    }

    private Redemption use(String code, Pending pending, Predicate<PlayerProfile> pair) {
        if (!pair.test(pending.player)) return new Redemption.Refused();
        remove(code);
        return new Redemption.Paired(pending.player);
    }

    private void remove(String code) {
        Pending pending = codes.remove(code);
        if (pending != null) codesByToken.remove(pending.token);
    }

    /** The code {@code player} was given last, if it's still valid. */
    public synchronized Optional<String> codeOf(UUID player, Instant now) {
        return codes.entrySet().stream()
                .filter(e -> e.getValue().player.id().equals(player) && !expired(e.getValue(), now))
                .map(Map.Entry::getKey)
                .findFirst();
    }

    private static Deque<Instant> forgetOld(Deque<Instant> failures, Instant now) {
        while (!failures.isEmpty() && !now.isBefore(failures.peekFirst().plus(FAILURE_WINDOW))) {
            failures.removeFirst();
        }
        return failures;
    }

    private static boolean expired(Pending pending, Instant now) {
        return !now.isBefore(pending.expiresAt);
    }
}
