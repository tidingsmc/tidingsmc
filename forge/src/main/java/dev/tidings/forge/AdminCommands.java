package dev.tidings.forge;

import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.logging.LogUtils;

import dev.tidings.core.Device;
import dev.tidings.core.Doctor;
import dev.tidings.core.PlayerProfile;
import dev.tidings.core.RelayClient;
import dev.tidings.core.Tidings;

import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.SharedSuggestionProvider;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.level.ServerPlayer;

import org.slf4j.Logger;

import java.io.UncheckedIOException;
import java.net.URI;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

/** {@code /tidings admin …}: for the server's owner and admins, in game or from the console. */
final class AdminCommands {
    private static final Logger LOGGER = LogUtils.getLogger();

    private final TidingsMod mod;

    private AdminCommands(TidingsMod mod) {
        this.mod = mod;
    }

    /** Same permission level as /kick and /ban. */
    static LiteralArgumentBuilder<CommandSourceStack> command(TidingsMod mod) {
        AdminCommands admin = new AdminCommands(mod);
        return Commands.literal("admin")
                .requires(source -> source.hasPermission(Commands.LEVEL_ADMINS))
                .then(
                        Commands.literal("status")
                                .executes(context -> admin.status(context.getSource())))
                .then(
                        Commands.literal("doctor")
                                .executes(context -> admin.doctor(context.getSource())))
                .then(
                        Commands.literal("devices")
                                .executes(context -> admin.devices(context.getSource(), null))
                                .then(
                                        Commands.argument("player", StringArgumentType.word())
                                                .suggests(
                                                        (context, builder) ->
                                                                SharedSuggestionProvider.suggest(
                                                                        admin.playersWithDevices(),
                                                                        builder))
                                                .executes(
                                                        context ->
                                                                admin.devices(
                                                                        context.getSource(),
                                                                        StringArgumentType
                                                                                .getString(
                                                                                        context,
                                                                                        "player")))))
                .then(
                        Commands.literal("unpair")
                                .then(
                                        Commands.argument("device", StringArgumentType.word())
                                                .executes(
                                                        context ->
                                                                admin.unpair(
                                                                        context.getSource(),
                                                                        StringArgumentType
                                                                                .getString(
                                                                                        context,
                                                                                        "device")))));
    }

    /** Tells the source why Tidings isn't running, if so. */
    private Tidings running(CommandSourceStack source) {
        Tidings tidings = mod.tidings();
        if (tidings == null) {
            String problem = mod.problem();
            source.sendFailure(
                    Component.literal(
                            "Tidings isn't running"
                                    + (problem == null ? "" : ": " + problem)
                                    + ". See the server log."));
        }
        return tidings;
    }

    private int status(CommandSourceStack source) {
        Tidings tidings = running(source);
        if (tidings == null) return 0;
        MutableComponent message =
                Component.literal("Tidings is running.").withStyle(ChatFormatting.GOLD);

        if (mod.api() instanceof RelayClient relay) {
            message.append(line("Phones reach it through the relay "))
                    .append(Component.literal(relay.host()).withStyle(ChatFormatting.AQUA))
                    .append(": ")
                    .append(relayState(relay));
            message.append(line("Relay owner key: "))
                    .append(
                            TidingsMod.copyable(
                                    tidings.store().vapidKeys().applicationServerKey(),
                                    ChatFormatting.GREEN));
        } else {
            message.append(line("Phones reach it at "))
                    .append(Component.literal(mod.publicUrl()).withStyle(ChatFormatting.AQUA))
                    .append(", the API listens on " + mod.listenAddress());
        }
        message.append(line("App: "))
                .append(Component.literal(TidingsConfig.appUrl()).withStyle(ChatFormatting.AQUA));

        List<Device> devices = tidings.devices();
        long owners = devices.stream().map(d -> d.player().id()).distinct().count();
        long withoutPush = devices.stream().filter(d -> d.push() == null).count();
        message.append(
                line(
                        plural(devices.size(), "paired device")
                                + " for "
                                + plural(owners, "player")
                                + (withoutPush == 0
                                        ? ""
                                        : ", " + withoutPush + " without notifications set up")));

        List<PlayerProfile> online = tidings.onlinePlayers();
        long hidden = online.stream().filter(p -> !tidings.isAnnounced(p.id())).count();
        message.append(
                line(
                        plural(tidings.store().knownPlayers().size(), "known player")
                                + ", "
                                + online.size()
                                + " online"
                                + (hidden == 0 ? "" : " (" + hidden + " hidden from phones)")));

        source.sendSuccess(() -> message, false);
        return 1;
    }

    /** Checks from this server what Tidings needs outside the game; answers once it's done. */
    private int doctor(CommandSourceStack source) {
        Tidings tidings = running(source);
        if (tidings == null) return 0;
        source.sendSuccess(
                () ->
                        Component.literal("Checking what Tidings needs, from this server…")
                                .withStyle(ChatFormatting.GRAY),
                false);
        new Doctor()
                .examine(
                        URI.create(mod.publicUrl()),
                        URI.create(TidingsConfig.appUrl()),
                        mod.api() instanceof RelayClient relay ? relay : null,
                        tidings.devices())
                .whenCompleteAsync(
                        (findings, error) -> {
                            if (error != null) {
                                LOGGER.error("Tidings couldn't finish its checks", error);
                                source.sendFailure(
                                        Component.literal(
                                                "The checks failed: see the server log."));
                                return;
                            }
                            report(source, findings);
                        },
                        source.getServer());
        return 1;
    }

    private static void report(CommandSourceStack source, List<Doctor.Finding> findings) {
        for (Doctor.Finding finding : findings) {
            Component line =
                    switch (finding.verdict()) {
                        case OK -> Component.literal("✔ ").withStyle(ChatFormatting.GREEN);
                        case WARNING -> Component.literal("⚠ ").withStyle(ChatFormatting.YELLOW);
                        case PROBLEM -> Component.literal("✘ ").withStyle(ChatFormatting.RED);
                    };
            source.sendSuccess(() -> Component.empty().append(line).append(finding.text()), false);
        }
        long problems = count(findings, Doctor.Verdict.PROBLEM);
        long warnings = count(findings, Doctor.Verdict.WARNING);
        String summary =
                problems == 0 && warnings == 0
                        ? "All good."
                        : plural(problems, "problem") + ", " + plural(warnings, "warning") + ".";
        source.sendSuccess(
                () ->
                        Component.literal(summary)
                                .withStyle(
                                        problems == 0 ? ChatFormatting.GREEN : ChatFormatting.RED),
                false);
    }

    private static long count(List<Doctor.Finding> findings, Doctor.Verdict verdict) {
        return findings.stream().filter(f -> f.verdict() == verdict).count();
    }

    private static Component relayState(RelayClient relay) {
        if (relay.isConnected()) {
            return Component.literal("connected").withStyle(ChatFormatting.GREEN);
        }
        String problem = relay.problem();
        return Component.literal(problem == null ? "connecting…" : "not connected, " + problem)
                .withStyle(ChatFormatting.RED);
    }

    private static Component line(String text) {
        return Component.literal("\n  " + text).withStyle(ChatFormatting.RESET);
    }

    private static String plural(long count, String noun) {
        return count + " " + noun + (count == 1 ? "" : "s");
    }

    private List<String> playersWithDevices() {
        Tidings tidings = mod.tidings();
        if (tidings == null) return List.of();
        return tidings.devices().stream().map(d -> d.player().name()).distinct().toList();
    }

    /** {@code playerName}: only theirs, or everyone's if null. */
    private int devices(CommandSourceStack source, String playerName) {
        Tidings tidings = running(source);
        if (tidings == null) return 0;
        List<Device> devices;
        if (playerName == null) {
            devices = tidings.devices();
            if (devices.isEmpty()) {
                source.sendSuccess(() -> Component.literal("No device is paired yet."), false);
                return 0;
            }
            source.sendSuccess(
                    () -> Component.literal(plural(devices.size(), "paired device") + ":"), false);
        } else {
            Optional<PlayerProfile> player = knownPlayer(tidings, playerName);
            if (player.isEmpty()) {
                source.sendFailure(
                        Component.literal(
                                "No player named "
                                        + playerName
                                        + " has played here since Tidings was installed."));
                return 0;
            }
            String name = player.get().name();
            devices = tidings.devicesOf(player.get().id());
            if (devices.isEmpty()) {
                source.sendSuccess(
                        () -> Component.literal(name + " has no paired devices."), false);
                return 0;
            }
            source.sendSuccess(() -> Component.literal(name + "'s paired devices:"), false);
        }
        for (Device device : devices) {
            String pairedOn =
                    device.pairedAt().atZone(ZoneId.systemDefault()).toLocalDate().toString();
            MutableComponent entry = Component.literal("• ");
            if (playerName == null) entry.append(device.player().name() + ": ");
            entry.append(TidingsMod.deviceName(device)).append(", paired " + pairedOn);
            if (device.push() == null) entry.append(", notifications not set up");
            entry.append(" ").append(unpairButton(device));
            source.sendSuccess(() -> entry, false);
        }
        return devices.size();
    }

    /** By name, whatever its case, online or not. */
    private static Optional<PlayerProfile> knownPlayer(Tidings tidings, String name) {
        return tidings.store().knownPlayers().stream()
                .filter(p -> p.name().equalsIgnoreCase(name))
                .findFirst();
    }

    private static Component unpairButton(Device device) {
        String command = "/tidings admin unpair " + device.id();
        return Component.literal("[Unpair]")
                .withStyle(
                        style ->
                                style.withColor(ChatFormatting.RED)
                                        .withClickEvent(
                                                new ClickEvent(
                                                        ClickEvent.Action.SUGGEST_COMMAND, command))
                                        .withHoverEvent(
                                                new HoverEvent(
                                                        HoverEvent.Action.SHOW_TEXT,
                                                        Component.literal(
                                                                "Unpair this device: press Enter"
                                                                        + " to confirm"))));
    }

    private int unpair(CommandSourceStack source, String deviceId) {
        Tidings tidings = running(source);
        if (tidings == null) return 0;
        Optional<Device> device;
        try {
            device =
                    tidings.devices().stream()
                            .filter(d -> d.id().equals(deviceId))
                            .findFirst()
                            .flatMap(d -> tidings.unpair(d.player().id(), d.id()));
        } catch (UncheckedIOException e) {
            LOGGER.error("Tidings couldn't save that the device {} was unpaired", deviceId, e);
            source.sendFailure(Component.literal("That couldn't be saved: see the server log."));
            return 0;
        }
        if (device.isEmpty()) {
            source.sendFailure(
                    Component.literal(
                            "No such device, it may already be unpaired. See /tidings admin"
                                    + " devices."));
            return 0;
        }
        Device unpaired = device.get();
        // Told to other ops too, like /kick.
        source.sendSuccess(
                () ->
                        Component.literal("Unpaired ")
                                .append(TidingsMod.deviceName(unpaired))
                                .append(" of " + unpaired.player().name() + "."),
                true);
        ServerPlayer owner = source.getServer().getPlayerList().getPlayer(unpaired.player().id());
        if (owner != null && owner != source.getEntity()) {
            owner.sendSystemMessage(
                    Component.literal("An admin unpaired your device ")
                            .append(TidingsMod.deviceName(unpaired))
                            .append(". Pair it again with ")
                            .append(TidingsMod.runnable("/tidings pair")));
        }
        return 1;
    }
}
