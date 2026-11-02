package dev.tidings.forge;

import dev.tidings.core.addon.Addon;
import dev.tidings.core.addon.AddonContext;
import dev.tidings.core.addon.Addons;

import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;

import java.util.function.Function;

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
    private static final Function<Addon, AddonContext> REGISTRAR = Addons.registrar();

    private TidingsAddons() {}

    /**
     * Call it from your mod's constructor with the context Forge gives it. A mod can add one tab
     *
     * @return what else Tidings offers the add-on, such as sending notifications: keep it
     * @throws IllegalStateException if the same mod registers twice
     */
    public static AddonContext register(FMLJavaModLoadingContext context, Addon.Builder addon) {
        return REGISTRAR.apply(addon.build(context.getContainer().getModId()));
    }
}
