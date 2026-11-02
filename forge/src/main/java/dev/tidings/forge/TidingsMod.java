package dev.tidings.forge;

import com.mojang.authlib.GameProfile;
import com.mojang.authlib.properties.Property;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.logging.LogUtils;

import dev.tidings.core.Api;
import dev.tidings.core.ApiServer;
import dev.tidings.core.Device;
import dev.tidings.core.Pairing;
import dev.tidings.core.PlayerProfile;
import dev.tidings.core.RelayClient;
import dev.tidings.core.Skins;
import dev.tidings.core.Store;
import dev.tidings.core.Tidings;
import dev.tidings.core.WebPush;

import net.minecraft.ChatFormatting;
import net.minecraft.Util;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.decoration.ItemFrame;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.RegisterCommandsEvent;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.event.entity.player.PlayerInteractEvent;
import net.minecraftforge.event.server.ServerStartedEvent;
import net.minecraftforge.event.server.ServerStartingEvent;
import net.minecraftforge.event.server.ServerStoppedEvent;
import net.minecraftforge.event.server.ServerStoppingEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.config.ModConfig;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import net.minecraftforge.fml.loading.FMLPaths;

import org.slf4j.Logger;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.BiFunction;

@Mod(TidingsMod.MOD_ID)
public final class TidingsMod {
    public static final String MOD_ID = "tidings";
    private static final Logger LOGGER = LogUtils.getLogger();

    private Tidings tidings;

    private AutoCloseable api;

    /**
     * Where phones reach {@link #api}, and where it listens without a relay: as configured when it
     * started, since Forge reloads the config file when it's edited
     */
    private String publicUrl;

    private String listenAddress;

    private WebPush push;

    private String problem;

    public TidingsMod(FMLJavaModLoadingContext context) {
        context.registerConfig(ModConfig.Type.COMMON, TidingsConfig.SPEC);
        MinecraftForge.EVENT_BUS.register(this);
    }

    @SubscribeEvent
    public void onServerStarting(ServerStartingEvent event) {
        MinecraftServer server = event.getServer();
        problem = null;
        String configProblem = TidingsConfig.problem();
        if (configProblem != null) {
            LOGGER.error("Tidings is disabled: {} in config/tidings-common.toml", configProblem);
            problem = configProblem + " in config/tidings-common.toml";
            return;
        }
        Path dataFile = FMLPaths.GAMEDIR.get().resolve("tidings").resolve("data.json");
        Store store;
        try {
            store = Store.open(dataFile);
        } catch (IOException e) {
            LOGGER.error("Tidings is disabled: couldn't read {}", dataFile, e);
            problem = "couldn't read " + dataFile;
            return;
        }
        push = new WebPush(store.vapidKeys(), TidingsConfig.vapidSubject());
        Tidings tidings =
                new Tidings(
                        store, new ForgeGame(server), push, TidingsConfig.ANNOUNCE_PLAYERS.get());
        this.tidings = tidings;
        tidings.onApprovalNeeded(
                device ->
                        server.execute(
                                () -> {
                                    ServerPlayer player =
                                            server.getPlayerList().getPlayer(device.player().id());
                                    if (player == null) {
                                        tidings.playerOffline(
                                                device.player().id(), device.id(), Instant.now());
                                        return;
                                    }
                                    player.playNotifySound(
                                            SoundEvents.NOTE_BLOCK_BELL.value(),
                                            SoundSource.PLAYERS,
                                            1f,
                                            1f);
                                    player.sendSystemMessage(approvalRequest(device));
                                }));

        String relayUrl = TidingsConfig.relayUrl();
        publicUrl = TidingsConfig.publicUrl();
        listenAddress = null;
        if (!relayUrl.isEmpty()) {
            api = new RelayClient(new Api(tidings), store.vapidKeys(), URI.create(relayUrl));
            LOGGER.info("Tidings API served through the relay {}", relayUrl);
            return;
        }
        String bindAddress = TidingsConfig.BIND_ADDRESS.get();
        int port = TidingsConfig.PORT.get();
        try {
            api =
                    new ApiServer(
                            new Api(tidings),
                            new InetSocketAddress(bindAddress, port),
                            TidingsConfig.CLIENT_IP_HEADER.get());
            listenAddress = bindAddress + ":" + port;
            LOGGER.info("Tidings API listening on {}, public URL {}", listenAddress, publicUrl);
        } catch (IOException e) {
            LOGGER.error(
                    "Tidings is disabled: couldn't listen on {}:{}; is the port already used?",
                    bindAddress,
                    port,
                    e);
            tidings.close();
            this.tidings = null;
            problem = "couldn't listen on " + bindAddress + ":" + port;
        }
    }

    @SubscribeEvent
    public void onServerStarted(ServerStartedEvent event) {
        if (tidings != null) tidings.serverStarted(Instant.now());
    }

    @SubscribeEvent
    public void onServerStopping(ServerStoppingEvent event) {
        if (tidings == null) return;
        try {
            tidings.serverStopping(Instant.now())
                    .get(WebPush.TIMEOUT.plusSeconds(1).toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (ExecutionException | TimeoutException e) {
            LOGGER.warn("Tidings couldn't send every \"server stopping\" notification in time");
        }
    }

    @SubscribeEvent
    public void onServerStopped(ServerStoppedEvent event) {
        if (api != null) {
            try {
                api.close();
            } catch (Exception e) {
                LOGGER.warn("Tidings couldn't stop its API cleanly", e);
            }
        }
        if (push != null) push.close();
        if (tidings != null) tidings.close();
        api = null;
        push = null;
        tidings = null;
    }

    @SubscribeEvent
    public void onPlayerLoggedIn(PlayerEvent.PlayerLoggedInEvent event) {
        Tidings tidings = this.tidings;
        if (tidings == null || !(event.getEntity() instanceof ServerPlayer player)) return;
        PlayerProfile profile = profile(player);
        tidings.playerJoined(profile, Instant.now());
        MinecraftServer server = player.server;
        CompletableFuture.supplyAsync(() -> tidings.rememberPlayer(profile), Util.ioPool())
                .whenCompleteAsync(
                        (firstTime, error) -> {
                            if (error != null) {
                                LOGGER.error(
                                        "Tidings couldn't save that {} joined",
                                        profile.name(),
                                        error);
                                return;
                            }
                            if (!firstTime
                                    || this.tidings != tidings
                                    || server.getPlayerList().getPlayer(profile.id()) != player) {
                                return;
                            }
                            player.sendSystemMessage(welcome(tidings.isAnnounced(profile.id())));
                            pair(player);
                        },
                        server);
    }

    @SubscribeEvent
    public void onServerTick(TickEvent.ServerTickEvent event) {
        Tidings tidings = this.tidings;
        if (tidings == null || event.phase != TickEvent.Phase.END) return;
        if (event.getServer().getTickCount() % 10 != 0) return;
        Instant now = Instant.now();
        PairingMap.sweep(event.getServer(), player -> tidings.pairingCodeOf(player, now));
    }

    @SubscribeEvent
    public void onEntityInteract(PlayerInteractEvent.EntityInteract event) {
        if (!(event.getTarget() instanceof ItemFrame)
                || !PairingMap.isPairingMap(event.getItemStack())) {
            return;
        }
        event.setCanceled(true);
        event.setCancellationResult(InteractionResult.FAIL);
    }

    @SubscribeEvent
    public void onPlayerLoggedOut(PlayerEvent.PlayerLoggedOutEvent event) {
        if (tidings == null) return;
        tidings.playerLeft(event.getEntity().getUUID(), Instant.now());
    }

    @SubscribeEvent
    public void onRegisterCommands(RegisterCommandsEvent event) {
        CommandDispatcher<CommandSourceStack> dispatcher = event.getDispatcher();
        dispatcher.register(
                Commands.literal("tidings")
                        .executes(context -> HelpCommand.run(context.getSource()))
                        .then(
                                Commands.literal("help")
                                        .executes(context -> HelpCommand.run(context.getSource())))
                        .then(
                                Commands.literal("pair")
                                        .executes(
                                                context ->
                                                        pair(
                                                                context.getSource()
                                                                        .getPlayerOrException()))
                                        .then(
                                                Commands.literal("code")
                                                        .executes(
                                                                context ->
                                                                        code(
                                                                                context.getSource()
                                                                                        .getPlayerOrException()))))
                        .then(
                                Commands.literal("devices")
                                        .executes(
                                                context ->
                                                        devices(
                                                                context.getSource()
                                                                        .getPlayerOrException())))
                        .then(
                                Commands.literal("hide")
                                        .executes(
                                                context ->
                                                        announce(
                                                                context.getSource()
                                                                        .getPlayerOrException(),
                                                                false)))
                        .then(
                                Commands.literal("show")
                                        .executes(
                                                context ->
                                                        announce(
                                                                context.getSource()
                                                                        .getPlayerOrException(),
                                                                true)))
                        .then(deviceCommand("approve", this::approve))
                        .then(deviceCommand("deny", this::deny))
                        .then(deviceCommand("unpair", this::unpair))
                        .then(AdminCommands.command(this)));
    }

    /** Null until the server has started, or if Tidings couldn't start: see {@link #problem} */
    Tidings tidings() {
        return tidings;
    }

    /** How phones reach the API: an {@link ApiServer} or a {@link RelayClient}, or null */
    AutoCloseable api() {
        return api;
    }

    /** Where phones reach the API, as it was started */
    String publicUrl() {
        return publicUrl;
    }

    /** Where the API listens, as it was started; null with a relay */
    String listenAddress() {
        return listenAddress;
    }

    /** Why Tidings isn't running, if it was tried */
    String problem() {
        return problem;
    }

    /** {@code /tidings <name> <device>} */
    private static LiteralArgumentBuilder<CommandSourceStack> deviceCommand(
            String name, BiFunction<ServerPlayer, String, Integer> run) {
        return Commands.literal(name)
                .then(
                        Commands.argument("device", StringArgumentType.word())
                                .executes(
                                        context ->
                                                run.apply(
                                                        context.getSource().getPlayerOrException(),
                                                        StringArgumentType.getString(
                                                                context, "device"))));
    }

    /** Tells the player Tidings isn't running, if so */
    private boolean notRunning(ServerPlayer player) {
        if (tidings != null) return false;
        player.sendSystemMessage(
                Component.literal("Tidings isn't running: see the server log.")
                        .withStyle(ChatFormatting.RED));
        return true;
    }

    /** Their map shows the previous code, which stops working. Null if they can't pair */
    private Pairing.Issued newCode(ServerPlayer player) {
        if (notRunning(player)) return null;
        Pairing.Issued code = tidings.startPairing(profile(player), Instant.now()).orElse(null);
        if (code == null) {
            player.sendSystemMessage(tooManyDevices());
            return null;
        }
        return code;
    }

    private int pair(ServerPlayer player) {
        Pairing.Issued code = newCode(player);
        if (code == null) return 0;
        String link =
                TidingsConfig.appUrl()
                        + "#pair="
                        + URLEncoder.encode(publicUrl, StandardCharsets.UTF_8)
                        + "&code="
                        + code.token();

        try {
            PairingMap.Given given = PairingMap.give(player, link, code.code());
            if (given != PairingMap.Given.NOWHERE) {
                MutableComponent where =
                        switch (given) {
                            case HAND -> Component.literal("Scan the map in your hand");
                            case OFFHAND ->
                                    Component.literal(
                                                    "The pairing map is in your other hand: press ")
                                            .append(Component.keybind("key.swapOffhand"))
                                            .append(" to hold it up and scan it");
                            default ->
                                    Component.literal(
                                            "A pairing map is in your inventory: hold it and scan"
                                                    + " it");
                        };
                player.sendSystemMessage(
                        where.append(" with your phone's camera. Can't scan it? ")
                                .append(runnable("/tidings pair code")));
            } else {
                player.sendSystemMessage(
                        Component.literal(
                                        "Your inventory is full: free a slot and use /tidings pair"
                                            + " again to get a map to scan, or pair with a code: ")
                                .append(runnable("/tidings pair code")));
            }
        } catch (IllegalArgumentException e) {
            LOGGER.warn("No pairing map: the link is too long ({} characters)", link.length(), e);
            player.sendSystemMessage(
                    Component.literal(
                                    "No map to scan: the pairing link is too long for one. Pair"
                                            + " with a code instead: ")
                            .append(runnable("/tidings pair code")));
        }
        return 1;
    }

    private int code(ServerPlayer player) {
        Pairing.Issued code = newCode(player);
        if (code == null) return 0;
        String address = publicUrl.replaceFirst("^https://", "");
        player.sendSystemMessage(
                Component.literal("On your phone, open ")
                        .append(copyable(TidingsConfig.appAddress(), ChatFormatting.AQUA))
                        .append(", tap \"Pair a server\", then \"Use a code\":")
                        .append("\n  Server address: ")
                        .append(copyable(address, ChatFormatting.GREEN))
                        .append("\n  Code: ")
                        .append(copyable(code.code(), ChatFormatting.GOLD))
                        .append(
                                "\nThe code works once, for "
                                        + Pairing.CODE_LIFETIME.toMinutes()
                                        + " minutes."));
        return 1;
    }

    /** Bold, and copied to the clipboard on click */
    static Component copyable(String text, ChatFormatting color) {
        return Component.literal(text)
                .withStyle(
                        style ->
                                style.withColor(color)
                                        .withBold(true)
                                        .withClickEvent(
                                                new ClickEvent(
                                                        ClickEvent.Action.COPY_TO_CLIPBOARD, text))
                                        .withHoverEvent(
                                                new HoverEvent(
                                                        HoverEvent.Action.SHOW_TEXT,
                                                        Component.literal("Click to copy"))));
    }

    private static Component welcome(boolean announced) {
        MutableComponent message =
                Component.empty()
                        .append(
                                Component.literal("This server has Tidings! ")
                                        .withStyle(ChatFormatting.GOLD))
                        .append("Get a ping on your phone whenever your friends hop on. ");
        if (announced) {
            return message.append("They get one when you do, too. Rather keep a low profile? ")
                    .append(runnable("/tidings hide"));
        }
        return message.append("Pair your phone and they'll get one when you hop on, too.");
    }

    private int announce(ServerPlayer player, boolean announce) {
        if (notRunning(player)) return 0;
        try {
            tidings.setAnnounced(player.getUUID(), announce);
        } catch (UncheckedIOException e) {
            LOGGER.error("Tidings couldn't save {}'s choice", player.getScoreboardName(), e);
            player.sendSystemMessage(
                    Component.literal("That couldn't be saved: see the server log.")
                            .withStyle(ChatFormatting.RED));
            return 0;
        }
        player.sendSystemMessage(announce ? onTheRadar() : offTheRadar());
        return 1;
    }

    private static Component onTheRadar() {
        return Component.literal("You're on the radar: ")
                .append(
                        "friends' phones ping when you join or leave, and the app shows you"
                                + " online. Rather keep a low profile? ")
                .append(runnable("/tidings hide"));
    }

    private static Component offTheRadar() {
        return Component.literal("You're off the radar: ")
                .append(
                        "no phone pings when you join or leave, and the app won't show you"
                                + " online. Players in the game still see you. Back on with ")
                .append(runnable("/tidings show"));
    }

    /** Runs {@code command} on click */
    static Component runnable(String command) {
        return Component.literal(command)
                .withStyle(
                        style ->
                                style.withColor(ChatFormatting.AQUA)
                                        .withUnderlined(true)
                                        .withClickEvent(
                                                new ClickEvent(
                                                        ClickEvent.Action.RUN_COMMAND, command)));
    }

    private static Component tooManyDevices() {
        return Component.literal(
                        "You already have "
                                + Tidings.MAX_DEVICES_PER_PLAYER
                                + " paired devices. Unpair one first: ")
                .append(
                        Component.literal("/tidings devices")
                                .withStyle(
                                        style ->
                                                style.withColor(ChatFormatting.AQUA)
                                                        .withUnderlined(true)
                                                        .withClickEvent(
                                                                new ClickEvent(
                                                                        ClickEvent.Action
                                                                                .RUN_COMMAND,
                                                                        "/tidings devices"))));
    }

    private int devices(ServerPlayer player) {
        if (notRunning(player)) return 0;
        List<Device> devices = tidings.devicesOf(player.getUUID());
        if (devices.isEmpty()) {
            player.sendSystemMessage(
                    Component.literal(
                            "You have no paired devices. Use /tidings pair to pair one."));
            return 0;
        }
        player.sendSystemMessage(Component.literal("Your paired devices:"));
        for (Device device : devices) {
            String pairedOn =
                    device.pairedAt().atZone(ZoneId.systemDefault()).toLocalDate().toString();
            player.sendSystemMessage(
                    Component.literal("• ")
                            .append(deviceName(device))
                            .append(", paired " + pairedOn + " ")
                            .append(unpairButton(device)));
        }
        return devices.size();
    }

    private int unpair(ServerPlayer player, String deviceId) {
        if (notRunning(player)) return 0;
        return tidings.unpair(player.getUUID(), deviceId)
                .map(
                        device -> {
                            player.sendSystemMessage(
                                    Component.literal("The device ")
                                            .append(deviceName(device))
                                            .append(" was unpaired."));
                            return 1;
                        })
                .orElseGet(
                        () -> {
                            player.sendSystemMessage(
                                    Component.literal(
                                                    "No such device, it may already be unpaired."
                                                            + " See /tidings devices.")
                                            .withStyle(ChatFormatting.RED));
                            return 0;
                        });
    }

    private int approve(ServerPlayer player, String deviceId) {
        if (notRunning(player)) return 0;
        Tidings.Approval approval;
        try {
            approval = tidings.approve(player.getUUID(), deviceId, Instant.now());
        } catch (UncheckedIOException e) {
            LOGGER.error("Tidings couldn't save {}'s new device", player.getScoreboardName(), e);
            player.sendSystemMessage(
                    Component.literal(
                                    "The device couldn't be saved: see the server log. Click"
                                            + " [Approve] again to retry.")
                            .withStyle(ChatFormatting.RED));
            return 0;
        }
        if (approval instanceof Tidings.Approval.Approved approved) {
            paired(player, approved.device());
            announceOnPairing(player);
            return 1;
        }
        if (approval instanceof Tidings.Approval.TooManyDevices) {
            player.sendSystemMessage(tooManyDevices());
            return 0;
        }
        player.sendSystemMessage(noSuchRequest());
        return 0;
    }

    /** The device is paired either way: failing to save this only keeps them hidden */
    private void announceOnPairing(ServerPlayer player) {
        try {
            if (tidings.announceIfUndecided(player.getUUID())) {
                player.sendSystemMessage(onTheRadar());
            }
        } catch (UncheckedIOException e) {
            LOGGER.error(
                    "Tidings couldn't save that {} is announced", player.getScoreboardName(), e);
        }
    }

    private void paired(ServerPlayer player, Device device) {
        player.playNotifySound(SoundEvents.PLAYER_LEVELUP, SoundSource.PLAYERS, 0.75f, 1f);
        player.sendSystemMessage(
                Component.literal("The device ").append(deviceName(device)).append(" is paired."));
    }

    private int deny(ServerPlayer player, String deviceId) {
        if (notRunning(player)) return 0;
        return tidings.deny(player.getUUID(), deviceId, Instant.now())
                .map(
                        device -> {
                            player.sendSystemMessage(
                                    Component.literal("Denied ")
                                            .append(deviceName(device))
                                            .append(
                                                    ". If you didn't ask for it, use /tidings"
                                                            + " pair to get a new code."));
                            return 1;
                        })
                .orElseGet(
                        () -> {
                            player.sendSystemMessage(noSuchRequest());
                            return 0;
                        });
    }

    private static Component noSuchRequest() {
        return Component.literal(
                        "No such pairing request: it may have expired. Use /tidings pair to try"
                                + " again.")
                .withStyle(ChatFormatting.RED);
    }

    private static Component approvalRequest(Device device) {
        return Component.literal("The device ")
                .append(deviceName(device))
                .append(" wants to pair with your account. ")
                .append(commandButton("[Approve]", ChatFormatting.GREEN, "approve", device))
                .append(" ")
                .append(commandButton("[Deny]", ChatFormatting.RED, "deny", device));
    }

    private static Component commandButton(
            String label, ChatFormatting color, String command, Device device) {
        return Component.literal(label)
                .withStyle(
                        style ->
                                style.withColor(color)
                                        .withBold(true)
                                        .withClickEvent(
                                                new ClickEvent(
                                                        ClickEvent.Action.RUN_COMMAND,
                                                        "/tidings "
                                                                + command
                                                                + " "
                                                                + device.id())));
    }

    static Component deviceName(Device device) {
        return Component.literal(device.name()).withStyle(ChatFormatting.GOLD);
    }

    private static Component unpairButton(Device device) {
        return Component.literal("[Unpair]")
                .withStyle(
                        style ->
                                style.withColor(ChatFormatting.RED)
                                        .withClickEvent(
                                                new ClickEvent(
                                                        ClickEvent.Action.RUN_COMMAND,
                                                        "/tidings unpair " + device.id()))
                                        .withHoverEvent(
                                                new HoverEvent(
                                                        HoverEvent.Action.SHOW_TEXT,
                                                        Component.literal("Unpair this device"))));
    }

    static PlayerProfile profile(Player player) {
        GameProfile profile = player.getGameProfile();
        String textures =
                profile.getProperties().get("textures").stream()
                        .findFirst()
                        .map(Property::getValue)
                        .orElse(null);
        return new PlayerProfile(player.getUUID(), profile.getName(), Skins.skinUrl(textures));
    }
}
