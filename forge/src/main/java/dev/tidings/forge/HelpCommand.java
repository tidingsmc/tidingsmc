package dev.tidings.forge;

import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;
import net.minecraft.network.chat.MutableComponent;

/** {@code /tidings help}, and {@code /tidings} alone: what each command does. */
final class HelpCommand {
    private HelpCommand() {}

    static int run(CommandSourceStack source) {
        MutableComponent message =
                Component.empty()
                        .append(Component.literal("Tidings").withStyle(ChatFormatting.GOLD))
                        .append(
                                ": your phone pings when friends join this server, and theirs"
                                        + " when you do. Get the app by pairing your phone:")
                        .append(entry("/tidings pair", "get a map with a QR code to scan"))
                        .append(entry("/tidings pair code", "pair by typing a code instead"))
                        .append(entry("/tidings devices", "see and unpair your paired devices"))
                        .append(
                                entry(
                                        "/tidings hide",
                                        "phones don't hear when you join or leave, nor see you"
                                                + " online"))
                        .append(entry("/tidings show", "phones hear about you again"));
        if (source.hasPermission(Commands.LEVEL_ADMINS)) {
            message.append(Component.literal("\nFor admins:").withStyle(ChatFormatting.GOLD))
                    .append(
                            entry(
                                    "/tidings admin status",
                                    "whether Tidings runs and how phones reach it"))
                    .append(
                            entry(
                                    "/tidings admin doctor",
                                    "check that phones, the app and push services all work"))
                    .append(
                            entry(
                                    "/tidings admin devices",
                                    "every paired device, or one player's with a name"))
                    .append(entry("/tidings admin unpair", "unpair anyone's device"));
        }
        source.sendSuccess(() -> message, false);
        return 1;
    }

    /** Clicking it fills in the command, for the player to run or complete. */
    private static Component entry(String command, String what) {
        return Component.literal("\n  ")
                .append(
                        Component.literal(command)
                                .withStyle(
                                        style ->
                                                style.withColor(ChatFormatting.AQUA)
                                                        .withClickEvent(
                                                                new ClickEvent(
                                                                        ClickEvent.Action
                                                                                .SUGGEST_COMMAND,
                                                                        command))
                                                        .withHoverEvent(
                                                                new HoverEvent(
                                                                        HoverEvent.Action.SHOW_TEXT,
                                                                        Component.literal(
                                                                                "Click to fill it"
                                                                                        + " in")))))
                .append(" " + what);
    }
}
