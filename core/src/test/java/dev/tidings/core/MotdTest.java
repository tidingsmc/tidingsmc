package dev.tidings.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import dev.tidings.core.Motd.Segment;

import org.junit.jupiter.api.Test;

import java.util.List;

class MotdTest {
    @Test
    void plainText() {
        assertEquals(
                List.of(new Segment("A Minecraft Server", null, false, false, false, false)),
                Motd.parse("A Minecraft Server"));
    }

    @Test
    void colorsAndFormats() {
        assertEquals(
                List.of(
                        new Segment("Hello ", "gold", false, false, false, false),
                        new Segment("world", "gold", true, false, false, false),
                        new Segment("\nplain", null, false, false, false, false)),
                Motd.parse("§6Hello §lworld§r\nplain"));
    }

    @Test
    void aColorClearsFormats() {
        assertEquals(
                List.of(
                        new Segment("a", null, true, false, false, false),
                        new Segment("b", "red", false, false, false, false)),
                Motd.parse("§la§cb"));
    }

    @Test
    void mergesRunsWithTheSameStyleAndDropsUnknownCodes() {
        assertEquals(
                List.of(new Segment("ab", "aqua", false, false, false, false)),
                Motd.parse("§ba§zb"));
    }

    @Test
    void dropsALoneSectionSignAtTheEnd() {
        assertEquals(
                List.of(new Segment("Welcome", null, false, false, false, false)),
                Motd.parse("Welcome§"));
    }
}
