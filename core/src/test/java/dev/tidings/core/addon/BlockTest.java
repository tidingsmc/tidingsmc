package dev.tidings.core.addon;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import org.junit.jupiter.api.Test;

import com.google.gson.JsonParser;

import dev.tidings.core.PlayerProfile;

class BlockTest {
    private static void assertJson(String expected, com.google.gson.JsonElement actual) {
        assertEquals(JsonParser.parseString(expected), actual);
    }

    @Test
    void viewsSayWhichBlocksTheyUse() {
        assertJson(
                "{version:5,title:'Stats',blocks:[{type:'heading',text:'Me'},"
                        + "{type:'text',text:'Hi'},{type:'text',text:'psst',muted:true}]}",
                View.of("Stats", Block.heading("Me"), Block.text("Hi"), Block.muted("psst"))
                        .toJson());
        assertJson("{version:5,blocks:[]}", View.of(null).toJson());
    }

    @Test
    void aViewCanBeAboutAPlayer() {
        UUID id = UUID.fromString("8667ba71-b85a-4004-af54-457a9734eed7");
        assertJson(
                "{version:5,title:'Steve',player:{uuid:'" + id + "',name:'Steve'},blocks:[]}",
                View.of("Steve").player(new PlayerProfile(id, "Steve", null)).toJson());
    }

    @Test
    void aViewCanRefreshItself() {
        assertJson(
                "{version:5,title:'Chat',refresh:3,blocks:[]}",
                View.of("Chat").refreshEvery(Duration.ofSeconds(3)).toJson());
        assertJson(
                "{version:5,refresh:3600,blocks:[]}",
                View.of(null).refreshEvery(Duration.ofHours(1)).toJson());
        for (Duration every : List.of(
                Duration.ZERO,
                Duration.ofMillis(1999),
                Duration.ofSeconds(-5),
                Duration.ofSeconds(3601),
                Duration.ofDays(100_000))) {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> View.of(null).refreshEvery(every),
                    every.toString());
        }
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
    void rowsAndNodesCanHaveIcons() {
        assertJson(
                "{type:'list',items:[{title:'Kills',icon:'sword'},{title:'Old'}]}",
                Block.list(
                                List.of(
                                        Block.ListItem.of("Kills").icon(Icon.named("sword")),
                                        new Block.ListItem("Old", null, null, null, null)))
                        .toJson());
        assertJson(
                "{type:'tree',nodes:[{id:'a',title:'A',icon:'image:YQ9a5NduMyY2oXvTV_1s6Q'}]}",
                Block.tree(
                                List.of(
                                        Block.TreeNode.of("a", "A")
                                                .icon(Icon.image("GIF89a".getBytes()))))
                        .toJson());
    }

    @Test
    void iconsAndImages() {
        assertJson("{type:'icon',icon:'trophy'}", Block.icon(Icon.named("trophy")).toJson());
        assertJson(
                "{type:'icon',icon:'coins',label:'12 coins'}",
                Block.icon(Icon.COINS, "12 coins").toJson());
        assertJson(
                "{type:'image',src:'image:YQ9a5NduMyY2oXvTV_1s6Q',alt:'A map'}",
                Block.image("GIF89a".getBytes(), "A map").toJson());
        assertJson(
                "{type:'image',src:'image:YQ9a5NduMyY2oXvTV_1s6Q',alt:'',width:64,"
                        + "pixelated:true}",
                Block.image("R0lGODlh", "").width(64).pixelArt().toJson());
        assertThrows(IllegalArgumentException.class, () -> Block.image("<svg>".getBytes(), ""));
        assertThrows(
                IllegalArgumentException.class,
                () -> Block.image(new byte[Block.Image.MAX_BYTES + 1], ""));
        assertThrows(
                IllegalArgumentException.class,
                () -> Block.image("GIF89a".getBytes(), "").width(Block.Image.MAX_WIDTH + 1));
        assertThrows(
                NullPointerException.class, () -> new Block.Image(null, "", 0, false));
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
    void chats() {
        assertJson(
                "{type:'chat',lines:[{name:'Steve',text:'hi @Alex',time:1793620800000},"
                        + "{name:'Alex',text:'hey',tag:'Phone',"
                        + "player:{uuid:'8667ba71-b85a-4004-af54-457a9734eed7',name:'Alex'},"
                        + "whisper:true},"
                        + "{text:'Steve left the game'}],"
                        + "action:'send',params:{room:'main'},placeholder:'Say hi',maxLength:100,"
                        + "empty:'Nothing yet'}",
                Block.chat(
                                List.of(
                                        Block.ChatLine.of("Steve", "hi @Alex")
                                                .time(Instant.ofEpochMilli(1793620800000L)),
                                        Block.ChatLine.of(
                                                new PlayerProfile(
                                                        UUID.fromString(
                                                                "8667ba71-b85a-4004-af54-457a9734eed7"),
                                                        "Alex",
                                                        null),
                                                "hey")
                                        .tag("Phone")
                                        .whispered(),
                                        Block.ChatLine.system("Steve left the game")),
                                "send")
                        .params(Map.of("room", "main"))
                        .placeholder("Say hi")
                        .maxLength(100)
                        .empty("Nothing yet")
                        .toJson());
        assertJson(
                "{type:'chat',lines:[]}",
                Block.chat(List.of()).placeholder("unused").toJson());
        assertThrows(IllegalArgumentException.class, () -> Block.chat(List.of(), "no spaces"));
        assertThrows(
                IllegalArgumentException.class, () -> Block.chat(List.of(), "send").maxLength(0));
        assertThrows(
                IllegalArgumentException.class,
                () -> Block.chat(List.of(), "send").maxLength(1001));
        List<Block.ChatLine> many = new ArrayList<>();
        for (int i = 0; i <= Block.Chat.MAX_LINES; i++) many.add(Block.ChatLine.system("#" + i));
        assertThrows(IllegalArgumentException.class, () -> Block.chat(many));
    }

    @Test
    void maps() {
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0};
        assertJson(
                "{type:'map',minX:-10,minZ:0,maxX:10,maxZ:40,"
                        + "background:'image:hDrCOxc2tEh-yBz3wH3dmw',"
                        + "areas:[{minX:-5,minZ:2,maxX:1,maxZ:8.5}],"
                        + "markers:[{x:0.5,z:3,label:'Town hall',icon:'crown',"
                        + "link:{view:'building',params:{id:'7'}}},"
                        + "{x:-2,z:20,label:'Bob'}]}",
                Block.map(-10, 0, 10, 40)
                        .background(png)
                        .areas(List.of(Block.MapArea.of(1, 8.5, -5, 2)))
                        .markers(
                                List.of(
                                        Block.MapMarker.of(0.5, 3, "Town hall")
                                                .icon(Icon.named("crown"))
                                                .link(Link.to("building", Map.of("id", "7"))),
                                        Block.MapMarker.of(-2, 20, "Bob")))
                        .toJson());
        assertJson("{type:'map',minX:0,minZ:0,maxX:1,maxZ:1}", Block.map(0, 0, 1, 1).toJson());
        assertThrows(IllegalArgumentException.class, () -> Block.map(0, 0, 0, 1));
        assertThrows(IllegalArgumentException.class, () -> Block.map(0, 5, 1, 1));
        assertThrows(IllegalArgumentException.class, () -> Block.map(0, 0, Double.NaN, 1));
        assertThrows(
                IllegalArgumentException.class,
                () -> Block.map(0, 0, 1, 1).background(new byte[] {1, 2, 3}));
        assertThrows(
                IllegalArgumentException.class,
                () -> Block.map(0, 0, 1, 1).background(new byte[Block.Image.MAX_BYTES + 1]));
        assertThrows(
                IllegalArgumentException.class,
                () -> Block.MapMarker.of(Double.POSITIVE_INFINITY, 0, "x"));
        List<Block.MapMarker> many = new ArrayList<>();
        for (int i = 0; i <= Block.MapBlock.MAX_MARKERS; i++) {
            many.add(Block.MapMarker.of(0, 0, "#" + i));
        }
        assertThrows(IllegalArgumentException.class, () -> Block.map(0, 0, 1, 1).markers(many));
        assertThrows(IllegalArgumentException.class, () -> Block.MapMarker.of(0, 0, " "));

        Icon face = Icon.image("GIF89a".getBytes());
        List<Block.MapMarker> faces = new ArrayList<>();
        for (int i = 0; i < Block.MapBlock.MAX_MARKERS; i++) {
            faces.add(Block.MapMarker.of(0, 0, "#" + i).icon(face));
        }
        Block.map(0, 0, 1, 1).markers(faces);
    }

    private static Icon gif(int i) {
        byte[] gif = "GIF89a??".getBytes();
        gif[6] = (byte) i;
        gif[7] = (byte) (i >> 8);
        return Icon.image(gif);
    }

    @Test
    void viewsShowFewDifferentImages() {
        List<Block.ListItem> rows = new ArrayList<>();
        for (int i = 0; i < 1000; i++) rows.add(Block.ListItem.of("#" + i).icon(gif(0)));
        assertEquals(1, View.of(null, Block.list(rows), Block.list(rows)).images().size());

        List<Block.MapMarker> markers = new ArrayList<>();
        List<Block.TreeNode> nodes = new ArrayList<>();
        for (int i = 0; i < View.MAX_IMAGES / 4; i++) {
            markers.add(Block.MapMarker.of(0, 0, "#" + i).icon(gif(i)));
            nodes.add(Block.TreeNode.of("#" + i, "#" + i).icon(gif(100 + i)));
        }
        Block map = Block.map(0, 0, 1, 1).markers(markers);
        Block tree = Block.tree(nodes);
        List<Block> blocks = new ArrayList<>(List.of(map, tree));
        for (int i = 0; i < View.MAX_IMAGES / 2; i++) {
            blocks.add(Block.card(Block.icon(gif(200 + i))));
        }
        assertEquals(View.MAX_IMAGES, View.of(null, blocks).images().size());
        blocks.add(Block.icon(gif(300)));
        assertThrows(IllegalArgumentException.class, () -> View.of(null, blocks).images());

        List<Block.ListItem> different = new ArrayList<>();
        for (int i = 0; i <= View.MAX_IMAGES; i++) {
            different.add(Block.ListItem.of("#" + i).icon(gif(i)));
        }
        assertThrows(
                IllegalArgumentException.class, () -> View.of(null, Block.list(different)).images());
    }

    @Test
    void mapBlocks() {
        assertEquals(new Block.MapArea(5, 0, 6, 11), Block.MapArea.blocks(5, 10, 5, 0));
        assertEquals(new Block.MapArea(-3, -2, 1, 1), Block.MapArea.blocks(0, -2, -3, 0));
        assertThrows(IllegalArgumentException.class, () -> Block.MapArea.of(5, 0, 5, 10));
        assertEquals(
                Block.MapMarker.of(3.5, -1.5, "Chest"), Block.MapMarker.atBlock(3, -2, "Chest"));
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
    void trees() {
        assertJson(
                "{type:'tree',nodes:["
                        + "{id:'root',title:'Minecraft',state:'done'},"
                        + "{id:'stone',parent:'root',title:'Stone Age',subtitle:'Mine stone',"
                        + "trailing:'Oct 30',state:'available',badge:'Goal',"
                        + "link:{view:'adv',params:{id:'stone'}}}]}",
                Block.tree(
                                List.of(
                                        Block.TreeNode.of("root", "Minecraft")
                                                .state(Block.TreeNode.State.DONE),
                                        Block.TreeNode.of("stone", "root", "Stone Age")
                                                .subtitle("Mine stone")
                                                .trailing("Oct 30")
                                                .state(Block.TreeNode.State.AVAILABLE)
                                                .badge("Goal")
                                                .link(Link.to("adv", Map.of("id", "stone")))))
                        .toJson());
    }

    @Test
    void treeParentsComeFirst() {
        Block.TreeNode root = Block.TreeNode.of("root", "Root");
        Block.TreeNode child = Block.TreeNode.of("child", "root", "Child");

        assertThrows(IllegalArgumentException.class, () -> Block.tree(List.of(child, root)));
        assertThrows(
                IllegalArgumentException.class,
                () -> Block.tree(List.of(root, Block.TreeNode.of("x", "nowhere", "X"))));
        assertThrows(IllegalArgumentException.class, () -> Block.tree(List.of(root, root)));
        assertThrows(IllegalArgumentException.class, () -> Block.TreeNode.of("a", "a", "A"));
        assertThrows(IllegalArgumentException.class, () -> Block.TreeNode.of("", "Empty"));
        List<Block.TreeNode> tooMany = new ArrayList<>();
        for (int i = 0; i <= Block.Tree.MAX_NODES; i++) {
            tooMany.add(Block.TreeNode.of("n" + i, "N"));
        }
        assertThrows(IllegalArgumentException.class, () -> Block.tree(tooMany));
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
