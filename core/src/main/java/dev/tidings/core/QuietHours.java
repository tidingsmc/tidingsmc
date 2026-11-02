package dev.tidings.core;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Objects;

public record QuietHours(boolean enabled, List<Period> periods) {

    public QuietHours {
        if (periods == null || periods.stream().anyMatch(Objects::isNull))
            throw new IllegalArgumentException("Missing quiet period");
        periods = List.copyOf(periods);
    }

    public record Period(LocalTime start, LocalTime end) {
        public Period {
            if (start == null || end == null) {
                throw new IllegalArgumentException("A quiet period needs a start and an end");
            }
            if (start.equals(end)) {
                throw new IllegalArgumentException(
                        "A quiet period can't start and end at the same time");
            }
        }

        public boolean contains(LocalTime time) {
            if (start.isBefore(end)) {
                return !time.isBefore(start) && time.isBefore(end);
            }
            return !time.isBefore(start) || time.isBefore(end);
        }
    }

    public static QuietHours off() {
        return new QuietHours(false, List.of(new Period(LocalTime.of(22, 0), LocalTime.of(8, 0))));
    }

    public boolean isQuietAt(Instant instant, ZoneId timeZone) {
        if (!enabled) return false;
        LocalTime time = instant.atZone(timeZone).toLocalTime();
        return periods.stream().anyMatch(period -> period.contains(time));
    }
}
