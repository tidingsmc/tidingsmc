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
 * Pairing codes: 6 digits, single-use, valid for {@link #CODE_LIFETIME}, at most one per player.
 */
public final class Pairing {
    public static final Duration CODE_LIFETIME = Duration.ofMinutes(5);
    static final int MAX_FAILURES = 10;
    static final int MAX_FAILURES_OVERALL = 60;
    static final Duration FAILURE_WINDOW = Duration.ofMinutes(1);

    private final Random random;
    private final Map<String, Pending> codes = new HashMap<>();

    private final Map<String, Deque<Instant>> failuresByClient = new HashMap<>();

    private final Deque<Instant> failures = new ArrayDeque<>();

    private record Pending(PlayerProfile player, Instant expiresAt) {}

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
    public synchronized String issue(PlayerProfile player, Instant now) {
        codes.values().removeIf(p -> p.player.id().equals(player.id()) || expired(p, now));
        String code;
        do {
            code = String.format("%06d", random.nextInt(1_000_000));
        } while (codes.containsKey(code));
        codes.put(code, new Pending(player, now.plus(CODE_LIFETIME)));
        return code;
    }

    /**
     * Uses up {@code code} if {@code pair} accepts its player. {@code pair} runs while no one else
     * can redeem the code; if it returns false or throws, the code stays valid.
     *
     * @param client who is guessing, such as their IP address, for the rate limit
     */
    public synchronized Redemption redeem(
            String code, String client, Instant now, Predicate<PlayerProfile> pair) {
        forgetOld(failures, now);
        failuresByClient.values().removeIf(f -> forgetOld(f, now).isEmpty());
        Deque<Instant> clientFailures = failuresByClient.getOrDefault(client, new ArrayDeque<>());
        if (clientFailures.size() >= MAX_FAILURES || failures.size() >= MAX_FAILURES_OVERALL) {
            return new Redemption.TooManyAttempts();
        }

        String key = code == null ? null : code.strip();
        Pending pending = key == null ? null : codes.get(key);
        if (pending == null || expired(pending, now)) {
            if (pending != null) codes.remove(key);
            failures.addLast(now);
            clientFailures.addLast(now);
            failuresByClient.put(client, clientFailures);
            return new Redemption.Invalid();
        }
        if (!pair.test(pending.player)) return new Redemption.Refused();
        codes.remove(key);
        return new Redemption.Paired(pending.player);
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
