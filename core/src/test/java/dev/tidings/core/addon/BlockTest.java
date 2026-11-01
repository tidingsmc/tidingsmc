package dev.tidings.core.addon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.google.gson.JsonParser;

import dev.tidings.core.PlayerProfile;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** The JSON must match the app's types in app/src/lib/addons.ts. */
class BlockTest {
    private static void assertJson(String expected, com.google.gson.JsonElement actual) {
        assertEquals(JsonParser.parseString(expected), actual);
    }

    @Test
    void viewsSayWhichBlocksTheyUse() {
        assertJson(
                "{version:1,title:'Stats',blocks:[{type:'heading',text:'Me'},"
                        + "{type:'text',text:'Hi'},{type:'text',text:'psst',muted:true}]}",
                View.of("Stats", Block.heading("Me"), Block.text("Hi"), Block.muted("psst"))
                        .toJson());
        assertJson("{version:1,blocks:[]}", View.of(null).toJson());
    }

    @Test
    void stats() {
        assertJson(
                "{type:'stats',items:[{label:'Deaths',value:'12'}]}",
                Block.stats(Block.Stat.of("Deaths", "12")).toJson());
    }

    @Test
    void lists() {
        UUID id = UUID.fromString("00000000-0000-0000-0000-000000000001");
        assertJson(
                "{type:'list',items:[{title:'Steve',subtitle:'Builder',trailing:'3',"
                        + "player:{uuid:'"
                        + id
                        + "',name:'Steve'},link:{view:'player',params:{id:'1'}}},"
                        + "{title:'Alex'}],empty:'Nobody'}",
                Block.list(
                                List.of(
                                        Block.ListItem.of("Steve")
                                                .subtitle("Builder")
                                                .trailing("3")
                                                .player(new PlayerProfile(id, "Steve", null))
                                                .link(Link.to("player", Map.of("id", "1"))),
                                        Block.ListItem.of("Alex")))
                        .empty("Nobody")
                        .toJson());
    }

    @Test
    void progress() {
        assertJson(
                "{type:'progress',label:'Advancements',value:3,max:10}",
                Block.progress("Advancements", 3, 10).toJson());
        assertThrows(IllegalArgumentException.class, () -> Block.progress("x", 11, 10));
        assertThrows(IllegalArgumentException.class, () -> Block.progress("x", 0, 0));
    }

    @Test
    void choices() {
        assertJson(
                "{type:'choices',items:[{label:'Deaths',link:{view:'top',params:{stat:'deaths'}},"
                        + "selected:true},{label:'Kills',link:{view:'top'}}]}",
                Block.choices(
                                List.of(
                                        Block.Choice.of(
                                                "Deaths",
                                                Link.to("top", Map.of("stat", "deaths")),
                                                true),
                                        Block.Choice.of("Kills", Link.to("top"), false)))
                        .toJson());
    }

    @Test
    void buttons() {
        assertJson(
                "{type:'button',label:'Recall',action:'recall',params:{id:'4'},"
                        + "style:'danger',confirm:'Sure?'}",
                Block.button("Recall", "recall")
                        .params(Map.of("id", "4"))
                        .style(Block.Button.Style.DANGER)
                        .confirm("Sure?")
                        .toJson());
        assertJson(
                "{type:'button',label:'More',link:{view:'more'}}",
                Block.button("More", Link.to("more")).toJson());
    }

    @Test
    void forms() {
        assertJson(
                "{type:'form',action:'say',submit:'Send',fields:["
                        + "{type:'text',name:'message',label:'Message',placeholder:'Hi!',maxLength:"
                        + "256},"
                        + "{type:'toggle',name:'loud',label:'Loud',value:false},"
                        + "{type:'select',name:'to',label:'To',options:[{value:'all',label:'All'}],"
                        + "value:'all'}]}",
                Block.form(
                                "say",
                                "Send",
                                Field.text("message", "Message").placeholder("Hi!").maxLength(256),
                                Field.toggle("loud", "Loud", false),
                                Field.select(
                                        "to", "To", List.of(Field.Option.of("all", "All")), "all"))
                        .toJson());
        assertThrows(
                IllegalArgumentException.class,
                () -> Block.form("say", "Send", Field.text("a", "A"), Field.text("a", "B")));
    }

    @Test
    void cards() {
        assertJson(
                "{type:'card',blocks:[{type:'text',text:'Hi'}]}",
                Block.card(Block.text("Hi")).toJson());
        assertThrows(
                IllegalArgumentException.class, () -> Block.card(Block.card(Block.text("Hi"))));
    }

    @Test
    void namesAreChecked() {
        assertThrows(IllegalArgumentException.class, () -> Link.to("../x"));
        assertThrows(IllegalArgumentException.class, () -> Block.button("x", "a b"));
        assertThrows(
                IllegalArgumentException.class,
                () -> Addon.builder("x").view("home", r -> View.of(null)).build("My Mod"));
        assertThrows(IllegalArgumentException.class, () -> Addon.builder("x").build("mod"));
    }

    @Test
    void addonIdsAreUnique() {
        Addons addons = new Addons();
        addons.add(Addon.builder("A").view("home", r -> View.of(null)).build("mod"));

        assertThrows(
                IllegalStateException.class,
                () -> addons.add(Addon.builder("B").view("home", r -> View.of(null)).build("mod")));
    }

    @Test
    void theFirstViewIsTheTabs() {
        Addon addon =
                Addon.builder("A")
                        .view("b", r -> View.of(null))
                        .view("a", r -> View.of(null))
                        .build("mod");

        assertEquals("b", addon.firstView());
    }

    @Test
    void addonsAreListedById() {
        Addons addons = new Addons();
        addons.add(Addon.builder("Zoo").view("home", r -> View.of(null)).build("zoo"));
        addons.add(Addon.builder("Bank").view("home", r -> View.of(null)).build("bank"));

        assertEquals(List.of("bank", "zoo"), addons.all().stream().map(Addon::id).toList());
    }

    @Test
    void addonIdsCanBeAsLongAsModIds() {
        String id = "a".repeat(64);
        assertEquals(id, Addon.builder("x").view("home", r -> View.of(null)).build(id).id());
        assertThrows(
                IllegalArgumentException.class,
                () -> Addon.builder("x").view("home", r -> View.of(null)).build(id + "a"));
    }

    @Test
    void theRegistrarCanOnlyBeTakenOnce() {
        Addons.registrar();
        assertThrows(IllegalStateException.class, Addons::registrar);
    }
}
