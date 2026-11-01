package dev.tidings.core.addon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

import java.util.List;

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
}
