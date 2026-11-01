package dev.tidings.core.addon;

/**
 * Thrown by an add-on's views and actions to refuse a request: the app shows the message to the
 * player as is ("You're not in this colony"). Any other exception shows a generic error, and is
 * logged.
 */
public class AddonError extends RuntimeException {
    public AddonError(String message) {
        super(message);
    }
}
