import { describe, expect, it } from "vitest";

import { fixtureSessionActor } from "@/contracts/fixtures";
import { fixtureServices } from "@/contracts/services";

import { newestSeqBySection } from "../shell/nav-items";
import { awaitingPublishLine, feedHref, feedParams } from "./activity-text";

const WEDDING_ID = "3e546e78-a307-5757-a6e2-2b08e26c0a76";

describe("the activity feed at D0 (AT-8.5)", () => {
  it("shows Mira 5 entries and Diya 4, newest first, with the read model's own words", async () => {
    const mira = await fixtureServices.read("activity_feed", {
      actor: fixtureSessionActor("mira", "b"),
      wedding_id: WEDDING_ID,
      params: { limit: 50 },
    });
    const diya = await fixtureServices.read("activity_feed", {
      actor: fixtureSessionActor("diya", "b"),
      wedding_id: WEDDING_ID,
      params: { limit: 50 },
    });
    expect(mira.entries).toHaveLength(5);
    expect(diya.entries).toHaveLength(4);
    for (const feed of [mira, diya]) {
      const seqs = feed.entries.map((entry) => entry.seq);
      expect([...seqs].sort((a, b) => b - a)).toEqual(seqs);
      for (const entry of feed.entries) expect(entry.summary_en.length).toBeGreaterThan(0);
    }
  });
});

describe("activity text", () => {
  it("maps the query to read-model params and back to links", () => {
    expect(feedParams({ day: "today", topic: "event.", before: "12" })).toEqual({
      limit: 50,
      day: "today",
      topic_prefix: "event.",
      before_seq: 12,
    });
    expect(feedParams({ day: "yesterday", topic: "nope.", before: "x" })).toEqual({ limit: 50 });
    expect(feedHref("/w/x/activity", {})).toBe("/w/x/activity");
    expect(feedHref("/w/x/activity", { day: "today", topic: "rsvp." })).toBe("/w/x/activity?day=today&topic=rsvp.");
  });

  it("builds the draft line from the entry's before value only", () => {
    expect(awaitingPublishLine({ awaiting_publish: false, before: { venue_name: "Banyan Hall" } })).toBeNull();
    expect(awaitingPublishLine({ awaiting_publish: true, before: { venue_name: "Banyan Hall" } })).toBe(
      "Draft. Guests still see Banyan Hall.",
    );
    expect(awaitingPublishLine({ awaiting_publish: true, before: { venue_id: "abc" } })).toBe(
      "Draft. Guests still see the published schedule.",
    );
  });
});

describe("the gold nav dot's sections", () => {
  it("maps topics to sections and keeps the newest seq", () => {
    expect(
      newestSeqBySection([
        { seq: 9, topic: "payment.corrected" },
        { seq: 8, topic: "event.updated" },
        { seq: 7, topic: "rsvp.marked" },
        { seq: 6, topic: "requirement.added" },
        { seq: 5, topic: "export.completed" },
      ]),
    ).toEqual({ money: 9, vendors: 9, events: 8, guests: 7 });
  });
});
