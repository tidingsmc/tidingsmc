package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.tidings.core.QuietHours.Period;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;

class QuietHoursTest {
    private static final ZoneId PARIS = ZoneId.of("Europe/Paris");
    private static final Period NIGHT = new Period(LocalTime.of(22, 0), LocalTime.of(8, 0));
    private static final Period WORK = new Period(LocalTime.of(9, 0), LocalTime.of(17, 0));

    private static Instant parisTime(int hour, int minute) {
        return LocalDateTime.of(2026, 10, 29, hour, minute).atZone(PARIS).toInstant();
    }

    @Test
    void periodAcrossMidnight() {
        QuietHours quiet = new QuietHours(true, List.of(NIGHT));

        assertTrue(quiet.isQuietAt(parisTime(22, 0), PARIS));
        assertTrue(quiet.isQuietAt(parisTime(2, 30), PARIS));
        assertTrue(quiet.isQuietAt(parisTime(7, 59), PARIS));
        assertFalse(quiet.isQuietAt(parisTime(8, 0), PARIS));
        assertFalse(quiet.isQuietAt(parisTime(15, 0), PARIS));
    }

    @Test
    void periodWithinOneDay() {
        QuietHours quiet = new QuietHours(true, List.of(WORK));

        assertTrue(quiet.isQuietAt(parisTime(12, 0), PARIS));
        assertFalse(quiet.isQuietAt(parisTime(8, 59), PARIS));
        assertFalse(quiet.isQuietAt(parisTime(17, 0), PARIS));
    }

    @Test
    void quietDuringAnyOfSeveralPeriods() {
        QuietHours quiet = new QuietHours(true, List.of(NIGHT, WORK));

        assertTrue(quiet.isQuietAt(parisTime(23, 0), PARIS));
        assertTrue(quiet.isQuietAt(parisTime(10, 0), PARIS));
        assertFalse(quiet.isQuietAt(parisTime(8, 30), PARIS), "between the two periods");
        assertFalse(quiet.isQuietAt(parisTime(19, 0), PARIS));
    }

    @Test
    void usesTheDeviceTimeZone() {
        QuietHours quiet = new QuietHours(true, List.of(NIGHT));

        // 21:30 UTC is 22:30 in Paris (winter time).
        assertTrue(quiet.isQuietAt(Instant.parse("2026-11-10T21:30:00Z"), PARIS));
    }

    @Test
    void periodMustNotStartAndEndAtTheSameTime() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new Period(LocalTime.of(22, 0), LocalTime.of(22, 0)));
    }

    @Test
    void disabledOrEmptyIsNeverQuiet() {
        assertFalse(new QuietHours(false, List.of(NIGHT, WORK)).isQuietAt(parisTime(23, 0), PARIS));
        assertFalse(new QuietHours(true, List.of()).isQuietAt(parisTime(23, 0), PARIS));
    }
}
