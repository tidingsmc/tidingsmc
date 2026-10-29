package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ReconnectFilterTest {
    private final ReconnectFilter filter = new ReconnectFilter(Duration.ofMinutes(5));
    private final UUID steve = UUID.randomUUID();
    private final Instant t0 = Instant.parse("2026-10-29T12:00:00Z");

    private Instant minutes(long m) {
        return t0.plus(Duration.ofMinutes(m));
    }

    @Test
    void firstJoinIsAnnounced() {
        assertEquals(new ReconnectFilter.Join(false, true), filter.onJoin(steve, t0));
    }

    @Test
    void quickReconnectIsHiddenBothWays() {
        filter.onJoin(steve, t0);
        filter.onLeave(steve, minutes(10));

        assertEquals(new ReconnectFilter.Join(false, false), filter.onJoin(steve, minutes(12)),
                "rejoin within grace is not announced");
        assertEquals(List.of(), filter.dueLeaves(minutes(30)), "and the leave is never announced");
    }

    @Test
    void leaveIsAnnouncedOnceGraceHasPassed() {
        filter.onLeave(steve, minutes(10));

        assertEquals(List.of(), filter.dueLeaves(minutes(14)));
        assertEquals(List.of(steve), filter.dueLeaves(minutes(15)));
        assertEquals(List.of(), filter.dueLeaves(minutes(20)), "announced only once");
    }

    @Test
    void joinAfterTheGracePeriodIsAnnounced() {
        filter.onLeave(steve, minutes(10));
        filter.dueLeaves(minutes(15));

        assertEquals(new ReconnectFilter.Join(false, true), filter.onJoin(steve, minutes(40)));
    }

    @Test
    void dueLeaveNotCollectedYetIsAnnouncedWithTheJoin() {
        filter.onLeave(steve, minutes(10));

        assertEquals(new ReconnectFilter.Join(true, true), filter.onJoin(steve, minutes(16)));
        assertEquals(List.of(), filter.dueLeaves(minutes(30)), "and not announced a second time");
    }

    @Test
    void stoppingServerDropsPendingLeavesAndIgnoresLaterOnes() {
        UUID alex = UUID.randomUUID();
        filter.onLeave(steve, minutes(10));

        filter.onServerStopping();
        filter.onLeave(alex, minutes(11));

        assertEquals(List.of(), filter.dueLeaves(minutes(30)));
    }
}
