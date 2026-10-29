package dev.tidings.forge;

import com.mojang.logging.LogUtils;
import dev.tidings.core.Tidings;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import org.slf4j.Logger;

@Mod(TidingsMod.MOD_ID)
public final class TidingsMod {
    public static final String MOD_ID = "tidings";
    private static final Logger LOGGER = LogUtils.getLogger();

    private final Tidings tidings = new Tidings();

    public TidingsMod() {
        MinecraftForge.EVENT_BUS.register(this);
    }

    @SubscribeEvent
    public void onPlayerLoggedIn(PlayerEvent.PlayerLoggedInEvent event) {
        Player player = event.getEntity();
        tidings.playerJoined(player.getUUID(), player.getGameProfile().getName());
        LOGGER.info("{} joined, online: {}", player.getGameProfile().getName(), tidings.onlinePlayers().size());
    }

    @SubscribeEvent
    public void onPlayerLoggedOut(PlayerEvent.PlayerLoggedOutEvent event) {
        tidings.playerLeft(event.getEntity().getUUID());
    }
}
