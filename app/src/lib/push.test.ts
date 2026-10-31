import i18next from "i18next";
import { describe, expect, it } from "vitest";
import { i18nOptions } from "../locales";
import { notificationContent, type PushMessage } from "./push";

const i18n = i18next.createInstance();
i18n.init(i18nOptions("en"));

const server = { id: "abc123", name: "Survival" };
const steve = { uuid: "8667ba71-b85a-4004-af54-457a9734eed7", name: "Steve" };

const content = (message: PushMessage) =>
  notificationContent(message, server, i18n.t);

describe("notificationContent", () => {
  it("titles every notification with the server's name", () => {
    expect(content({ kind: "player_joined", player: steve })).toEqual({
      title: "Survival",
      body: "Steve joined",
      tag: `abc123:player:${steve.uuid}`,
    });
    expect(content({ kind: "server_started" }).title).toBe("Survival");
  });

  it("a player's leave replaces their join", () => {
    expect(content({ kind: "player_left", player: steve }).tag).toBe(
      content({ kind: "player_joined", player: steve }).tag,
    );
  });

  it("keeps different players' news apart, by UUID rather than name", () => {
    const renamed = { ...steve, name: "Steve2" };
    const alex = { uuid: "ec561538-f3fd-461d-aff5-086b22154bce", name: "Alex" };

    expect(content({ kind: "player_joined", player: renamed }).tag).toBe(
      content({ kind: "player_joined", player: steve }).tag,
    );
    expect(content({ kind: "player_joined", player: alex }).tag).not.toBe(
      content({ kind: "player_joined", player: steve }).tag,
    );
  });

  it("the server stopping replaces it starting", () => {
    expect(content({ kind: "server_stopping" })).toEqual({
      title: "Survival",
      body: "The server is shutting down",
      tag: "abc123:status",
    });
    expect(content({ kind: "server_started" }).tag).toBe("abc123:status");
  });

  it("keeps each server's notifications apart", () => {
    const other = notificationContent(
      { kind: "server_started" },
      { id: "def456", name: "Creative" },
      i18n.t,
    );

    expect(other.tag).not.toBe(content({ kind: "server_started" }).tag);
  });

  it("names nobody in particular when the player is missing", () => {
    expect(content({ kind: "player_joined" }).body).toBe("Someone joined");
  });

  // Notifications are plain text: escaping would show "&lt;" on the phone.
  it("shows names as they are", () => {
    expect(
      content({ kind: "player_joined", player: { ...steve, name: "<b>&" } })
        .body,
    ).toBe("<b>& joined");
  });
});
