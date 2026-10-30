package dev.tidings.forge;

import dev.tidings.core.QrCode;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.Tag;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Container;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.MapItem;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.saveddata.SavedData;
import net.minecraft.world.level.saveddata.maps.MapItemSavedData;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

/**
 * The maps players scan to pair. Each code gets its own map ID: once the code stops working (used,
 * replaced or expired), every copy of its map is taken away and the ID goes to the next map, so the
 * world doesn't fill up with map files.
 */
final class PairingMap {
    private static final String TAG = "tidings_pairing";

    private static final String CODE_TAG = "tidings_code";

    private static final int MAP_SIZE = 128;

    private static final int QUIET_ZONE = 4;

    private static final byte DARK = MapColor.COLOR_BLACK.getPackedId(MapColor.Brightness.LOWEST);
    private static final byte LIGHT = MapColor.SNOW.getPackedId(MapColor.Brightness.HIGH);

    private PairingMap() {}

    /**
     * Gives {@code player} a map with {@code link} as a QR code: in their hand if it's empty,
     * otherwise in their inventory.
     *
     * @return false if their inventory is full
     * @throws IllegalArgumentException if the link is too long to fit on a map
     */
    static boolean give(ServerPlayer player, String link, String code) {
        if (!player.getMainHandItem().isEmpty() && player.getInventory().getFreeSlot() == -1) {
            return false;
        }
        QrCode qr = QrCode.encode(link, QrCode.Ecc.MEDIUM);
        MapItemSavedData data = blank();
        draw(data, qr);
        ServerLevel level = player.server.overworld();
        int id = Ids.of(level).take(level, player.getUUID(), code);
        level.setMapData(MapItem.makeKey(id), data);

        ItemStack map = new ItemStack(Items.FILLED_MAP);
        map.getOrCreateTag().putInt("map", id);
        map.getOrCreateTag().putBoolean(TAG, true);
        map.getOrCreateTag().putString(CODE_TAG, code);
        map.setHoverName(Component.literal("Tidings pairing"));

        if (player.getMainHandItem().isEmpty()) {
            player.setItemInHand(InteractionHand.MAIN_HAND, map);
        } else {
            player.getInventory().add(map);
        }
        return true;
    }

    /**
     * Frees the maps whose code stopped working
     *
     * @param codeOf the code a player was given last, if it's still valid
     */
    static void sweep(MinecraftServer server, Function<UUID, Optional<String>> codeOf) {
        ServerLevel level = server.overworld();
        Ids ids = Ids.of(level);
        ids.freeUnused(level, codeOf);
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            remove(player.getInventory(), ids);
            remove(player.getEnderChestInventory(), ids);
            AbstractContainerMenu menu = player.containerMenu;
            for (Slot slot : menu.slots) {
                if (ids.stale(slot.getItem())) slot.set(ItemStack.EMPTY);
            }
            if (ids.stale(menu.getCarried())) menu.setCarried(ItemStack.EMPTY);
        }
    }

    static boolean isPairingMap(ItemStack stack) {
        return stack.is(Items.FILLED_MAP) && stack.hasTag() && stack.getTag().getBoolean(TAG);
    }

    private static void remove(Container container, Ids ids) {
        for (int i = 0; i < container.getContainerSize(); i++) {
            if (ids.stale(container.getItem(i))) container.setItem(i, ItemStack.EMPTY);
        }
    }

    /** Locked, so the game doesn't draw the terrain over it. */
    private static MapItemSavedData blank() {
        return MapItemSavedData.createFresh(0, 0, (byte) 0, false, false, Level.OVERWORLD).locked();
    }

    /** The map IDs pairing maps use, kept with the world. */
    private static final class Ids extends SavedData {
        private static final String NAME = "tidings_pairing_maps";

        private record Use(UUID player, String code) {}

        private final Map<Integer, Use> used = new HashMap<>();

        private final Deque<Integer> free = new ArrayDeque<>();

        static Ids of(ServerLevel level) {
            return level.getDataStorage().computeIfAbsent(Ids::load, Ids::new, NAME);
        }

        int take(ServerLevel level, UUID player, String code) {
            Integer id = free.pollFirst();
            if (id == null) id = level.getFreeMapId();
            used.put(id, new Use(player, code));
            setDirty();
            return id;
        }

        void freeUnused(ServerLevel level, Function<UUID, Optional<String>> codeOf) {
            Iterator<Map.Entry<Integer, Use>> entries = used.entrySet().iterator();
            while (entries.hasNext()) {
                Map.Entry<Integer, Use> entry = entries.next();
                Use use = entry.getValue();
                if (codeOf.apply(use.player).filter(use.code::equals).isPresent()) continue;
                entries.remove();
                // Copies no one can reach yet, in a closed chest, show nothing meanwhile.
                level.setMapData(MapItem.makeKey(entry.getKey()), blank());
                free.addLast(entry.getKey());
                setDirty();
            }
        }

        boolean stale(ItemStack stack) {
            if (!isPairingMap(stack)) return false;
            Integer id = MapItem.getMapId(stack);
            Use use = id == null ? null : used.get(id);
            return use == null || !use.code.equals(stack.getTag().getString(CODE_TAG));
        }

        private static Ids load(CompoundTag tag) {
            Ids ids = new Ids();
            for (Tag entry : tag.getList("used", Tag.TAG_COMPOUND)) {
                CompoundTag use = (CompoundTag) entry;
                ids.used.put(
                        use.getInt("id"), new Use(use.getUUID("player"), use.getString("code")));
            }
            for (int id : tag.getIntArray("free")) ids.free.addLast(id);
            return ids;
        }

        @Override
        public CompoundTag save(CompoundTag tag) {
            ListTag list = new ListTag();
            used.forEach(
                    (id, use) -> {
                        CompoundTag entry = new CompoundTag();
                        entry.putInt("id", id);
                        entry.putUUID("player", use.player);
                        entry.putString("code", use.code);
                        list.add(entry);
                    });
            tag.put("used", list);
            tag.putIntArray("free", List.copyOf(free));
            return tag;
        }
    }

    private static void draw(MapItemSavedData data, QrCode qr) {
        int scale = MAP_SIZE / (qr.size + QUIET_ZONE * 2);
        if (scale == 0) throw new IllegalArgumentException("Pairing link too long for a map");
        int offset = (MAP_SIZE - qr.size * scale) / 2;
        for (int y = 0; y < MAP_SIZE; y++) {
            for (int x = 0; x < MAP_SIZE; x++) {
                int mx = Math.floorDiv(x - offset, scale);
                int my = Math.floorDiv(y - offset, scale);
                boolean dark =
                        mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.isDark(mx, my);
                data.setColor(x, y, dark ? DARK : LIGHT);
            }
        }
    }
}
