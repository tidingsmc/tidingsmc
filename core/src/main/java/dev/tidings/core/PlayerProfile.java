package dev.tidings.core;

import java.util.UUID;

/**
 * A Minecraft account as the app shows it
 *
 * @param skinUrl skin texture from the game profile (textures.minecraft.net), null on offline-mode
 *     servers
 */
public record PlayerProfile(UUID id, String name, String skinUrl) {}
