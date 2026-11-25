import { describe, expect, it } from "vitest";

import { noteActivity } from "./notes";

describe("add_note's activity entry", () => {
  it("names who saved it, the topic and the text, for every member", () => {
    const entry = noteActivity({ actor_label: "Mira", note_id: "n1", topic: "parking", note_text: "Valet parking for 100 cars" });
    expect(entry.topic).toBe("note.added");
    expect(entry.entity_type).toBe("wedding_note");
    expect(entry.summary_en).toBe('Mira saved a note about parking: "Valet parking for 100 cars"');
    expect(entry.summary_hi).toBe("Mira ने parking पर नोट सेव किया: Valet parking for 100 cars");
    expect(entry.visibility).toBe("members");
    expect(entry.before).toBeNull();
  });
});
