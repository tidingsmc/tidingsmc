package dev.tidings.core;

import java.time.Instant;

/**
 * A device paired with this server.
 *
 * @param tokenHash see {@link Tokens#hash}
 * @param player the account that paired it
 * @param push null until the app sends its push subscription
 */
public record Device(
        String id,
        String tokenHash,
        String name,
        PlayerProfile player,
        Instant pairedAt,
        DeviceSettings settings,
        PushSubscription push) {

    public Device withSettings(DeviceSettings settings) {
        return new Device(id, tokenHash, name, player, pairedAt, settings, push);
    }

    public Device withPush(PushSubscription push) {
        return new Device(id, tokenHash, name, player, pairedAt, settings, push);
    }
}
