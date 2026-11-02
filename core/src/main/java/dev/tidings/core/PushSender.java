package dev.tidings.core;

import java.time.Duration;
import java.util.concurrent.CompletableFuture;

/**
 * Delivers pushes to devices. {@link WebPush} sends them straight to the browsers' push services
 */
public interface PushSender {
    enum Result {
        DELIVERED,
        /** The push service no longer knows this subscription: nothing will ever reach it */
        GONE,
        /** Not delivered this time; already logged */
        FAILED
    }

    /**
     * Never completes exceptionally: failures complete with {@link Result#FAILED}
     *
     * @param ttl how long the push service keeps it while the device is offline
     * @param topic pushes with the same topic replace each other while waiting to be delivered
     */
    CompletableFuture<Result> send(PushSubscription to, byte[] payload, Duration ttl, String topic);
}
