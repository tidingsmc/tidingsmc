package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

class PairingTest {
    private static final Instant NOW = Instant.parse("2026-10-29T12:00:00Z");
    private final PlayerProfile steve = new PlayerProfile(UUID.randomUUID(), "Steve", null);
    private static final String ALEX_PHONE = "203.0.113.1";
    private static final String TROLL = "198.51.100.7";
    private final Pairing pairing = new Pairing();

    private Pairing.Redemption redeem(String code, String client, Instant now) {
        return pairing.redeem(code, client, now, player -> true);
    }

    @Test
    void codesAreSixDigits() {
        assertTrue(pairing.issue(steve, NOW).matches("\\d{6}"));
    }

    @Test
    void aCodePairsItsPlayerOnce() {
        String code = pairing.issue(steve, NOW);

        assertEquals(new Pairing.Redemption.Paired(steve), redeem(code, ALEX_PHONE, NOW));
        assertInstanceOf(Pairing.Redemption.Invalid.class, redeem(code, ALEX_PHONE, NOW));
    }

    @Test
    void aRefusedPairingKeepsTheCode() {
        String code = pairing.issue(steve, NOW);

        assertEquals(
                new Pairing.Redemption.Refused(),
                pairing.redeem(code, ALEX_PHONE, NOW, player -> false));
        assertEquals(new Pairing.Redemption.Paired(steve), redeem(code, ALEX_PHONE, NOW));
    }

    @Test
    void ignoresSurroundingSpaces() {
        String code = pairing.issue(steve, NOW);

        assertEquals(new Pairing.Redemption.Paired(steve), redeem(" " + code, ALEX_PHONE, NOW));
    }

    @Test
    void codesExpire() {
        String code = pairing.issue(steve, NOW);

        assertInstanceOf(
                Pairing.Redemption.Invalid.class,
                redeem(code, ALEX_PHONE, NOW.plus(Pairing.CODE_LIFETIME)));
    }

    @Test
    void aNewCodeReplacesThePlayersPreviousOne() {
        String first = pairing.issue(steve, NOW);
        String second = pairing.issue(steve, NOW);

        if (!first.equals(second)) {
            assertInstanceOf(Pairing.Redemption.Invalid.class, redeem(first, ALEX_PHONE, NOW));
        }
        assertEquals(new Pairing.Redemption.Paired(steve), redeem(second, ALEX_PHONE, NOW));
    }

    @Test
    void tooManyWrongCodesBlockThatClientForAWhile() {
        String code = pairing.issue(steve, NOW);
        String wrong = code.equals("000000") ? "000001" : "000000";
        for (int i = 0; i < Pairing.MAX_FAILURES; i++) redeem(wrong, ALEX_PHONE, NOW);

        assertInstanceOf(Pairing.Redemption.TooManyAttempts.class, redeem(code, ALEX_PHONE, NOW));
        assertEquals(
                new Pairing.Redemption.Paired(steve),
                redeem(code, ALEX_PHONE, NOW.plus(Pairing.FAILURE_WINDOW)));
    }

    @Test
    void oneClientGuessingDoesntBlockOthers() {
        String code = pairing.issue(steve, NOW);
        String wrong = code.equals("000000") ? "000001" : "000000";
        for (int i = 0; i < Pairing.MAX_FAILURES; i++) redeem(wrong, TROLL, NOW);

        assertEquals(new Pairing.Redemption.Paired(steve), redeem(code, ALEX_PHONE, NOW));
    }

    @Test
    void tooManyWrongCodesOverallBlockEveryone() {
        String code = pairing.issue(steve, NOW);
        String wrong = code.equals("000000") ? "000001" : "000000";
        for (int i = 0; i < Pairing.MAX_FAILURES_OVERALL; i++) {
            redeem(wrong, "198.51.100." + i, NOW);
        }

        assertInstanceOf(Pairing.Redemption.TooManyAttempts.class, redeem(code, ALEX_PHONE, NOW));
        assertEquals(
                new Pairing.Redemption.Paired(steve),
                redeem(code, ALEX_PHONE, NOW.plus(Pairing.FAILURE_WINDOW)));
    }

    @Test
    void knowsThePlayersValidCode() {
        String code = pairing.issue(steve, NOW);

        assertEquals(Optional.of(code), pairing.codeOf(steve.id(), NOW));
        assertEquals(Optional.empty(), pairing.codeOf(steve.id(), NOW.plus(Pairing.CODE_LIFETIME)));
    }
}
