package dev.tidings.core;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Hides quick reconnects (lag, crashes): a player who leaves and comes back within the grace period
 * is announced neither as leaving nor as joining again.
 */
public final class ReconnectFilter {
    private final Duration grace;

    /** Players who left and haven't been announced yet, with when they left. */
    private final Map<UUID, Instant> pendingLeaves = new HashMap<>();

    private boolean stopping;

    public ReconnectFilter(Duration grace) {
        this.grace = grace;
    }

    /** What to announce when a player joins, in this order: their overdue leave, then the join. */
    public record Join(boolean announceLeave, boolean announceJoin) {}

    public synchronized Join onJoin(UUID player, Instant now) {
        Instant leftAt = pendingLeaves.remove(player);
        if (leftAt == null) return new Join(false, true);
        boolean graceOver = !now.isBefore(leftAt.plus(grace));
        return new Join(graceOver, graceOver);
    }

    public synchronized void onLeave(UUID player, Instant now) {
        if (stopping) return;
        pendingLeaves.put(player, now);
    }

    /** Drops the leaves not announced yet, and ignores players leaving from now on. */
    public synchronized void onServerStopping() {
        stopping = true;
        pendingLeaves.clear();
    }

    /**
     * @return players whose leave is now confirmed and should be announced, each returned once
     */
    public synchronized List<UUID> dueLeaves(Instant now) {
        List<UUID> due = new ArrayList<>();
        for (Iterator<Map.Entry<UUID, Instant>> it = pendingLeaves.entrySet().iterator();
                it.hasNext(); ) {
            Map.Entry<UUID, Instant> entry = it.next();
            if (!now.isBefore(entry.getValue().plus(grace))) {
                due.add(entry.getKey());
                it.remove();
            }
        }
        return due;
    }
}
