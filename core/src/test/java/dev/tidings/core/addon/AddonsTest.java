package dev.tidings.core.addon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

class AddonsTest {
    private static Addon addon(String id) {
        return Addon.builder(id).view("home", r -> View.of(null)).build(id);
    }

    @Test
    void theRegisteredOnesOnlyComeThroughTheRegistrar() {
        assertThrows(IllegalStateException.class, () -> Addons.registered().add(addon("othermod")));
        assertEquals(List.of(), Addons.registered().all());
    }

    @Test
    void theyAreSortedById() {
        Addons addons = new Addons();
        addons.add(addon("zeta"));
        addons.add(addon("alpha"));

        assertEquals(List.of("alpha", "zeta"), addons.all().stream().map(Addon::id).toList());
    }

    @Test
    void anIdIsTakenOnce() {
        Addons addons = new Addons();
        addons.add(addon("bank"));

        assertThrows(IllegalStateException.class, () -> addons.add(addon("bank")));
    }

    @Test
    void notificationsStayShortEnoughForAPush() {
        assertThrows(IllegalArgumentException.class, () -> Notification.of(" "));
        assertThrows(
                IllegalArgumentException.class,
                () -> Notification.of("x".repeat(Notification.MAX_TEXT_LENGTH + 1)));
        Map<String, String> params = new HashMap<>();
        for (int i = 0; i < 5; i++) params.put("p" + i, "x".repeat(250));
        assertThrows(
                IllegalArgumentException.class,
                () -> Notification.of("Hi").link(Link.to("home", params)));
        // Counted as sent: each "é" is 2 bytes, each control character 6 once escaped.
        Map<String, String> accented =
                Map.of("a", "é".repeat(250), "b", "é".repeat(250), "c", "é".repeat(250));
        assertThrows(
                IllegalArgumentException.class,
                () -> Notification.of("Hi").link(Link.to("home", accented)));
        Map<String, String> control = Map.of("p", "\u0001".repeat(200));
        assertThrows(
                IllegalArgumentException.class,
                () -> Notification.of("Hi").link(Link.to("home", control)));
        Notification.of("Hi").link(Link.to("home", Map.of("p", "x".repeat(250))));
    }
}
