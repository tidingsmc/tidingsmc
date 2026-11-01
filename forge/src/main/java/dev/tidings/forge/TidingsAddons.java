package dev.tidings.forge;

import dev.tidings.core.addon.Addon;
import dev.tidings.core.addon.Addons;

import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;

import java.util.function.Consumer;

/**
 * Where Forge mods add their tab to the Tidings app. The tab's ID is the mod's ID, so it never
 * changes and no two mods can share one.
 *
 * <pre>{@code
 * @Mod("bounties")
 * public class BountiesMod {
 *     public BountiesMod(FMLJavaModLoadingContext context) {
 *         // In a class of its own, so that the mod still loads without Tidings.
 *         if (ModList.get().isLoaded("tidings")) BountiesAddon.register(context);
 *     }
 * }
 * }</pre>
 */
public final class TidingsAddons {
    private static final Consumer<Addon> REGISTRAR = Addons.registrar();

    private TidingsAddons() {}

    /**
     * Call it from your mod's constructor, with the context Forge gives it. A mod can add one tab.
     *
     * @throws IllegalStateException if the same mod registers twice
     */
    public static void register(FMLJavaModLoadingContext context, Addon.Builder addon) {
        REGISTRAR.accept(addon.build(context.getContainer().getModId()));
    }
}
