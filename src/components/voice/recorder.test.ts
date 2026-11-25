import { describe, expect, it } from "vitest";

import {
  baseMimeType,
  classifyMicError,
  clipFileName,
  decideRelease,
  formatTimer,
  gestureFromDrag,
  pickRecorderType,
} from "./recorder";

describe("pickRecorderType (voice.md 1.3)", () => {
  it("takes the first supported type in order", () => {
    const all = pickRecorderType(() => true);
    expect(all).toEqual({ recorder_type: "audio/webm;codecs=opus", upload_type: "audio/webm", file_name: "clip.webm" });
  });

  it("falls to audio/webm on older Chromium", () => {
    const choice = pickRecorderType((t) => t === "audio/webm");
    expect(choice).toEqual({ recorder_type: "audio/webm", upload_type: "audio/webm", file_name: "clip.webm" });
  });

  it("uses audio/mp4 with clip.m4a on Safari before 18.4", () => {
    const choice = pickRecorderType((t) => t === "audio/mp4");
    expect(choice).toEqual({ recorder_type: "audio/mp4", upload_type: "audio/mp4", file_name: "clip.m4a" });
  });

  it("uploads ogg opus as audio/ogg with clip.ogg", () => {
    const choice = pickRecorderType((t) => t === "audio/ogg;codecs=opus");
    expect(choice).toEqual({ recorder_type: "audio/ogg;codecs=opus", upload_type: "audio/ogg", file_name: "clip.ogg" });
  });

  it("returns null with no usable type, a throwing check or no recorder", () => {
    expect(pickRecorderType(() => false)).toBeNull();
    expect(
      pickRecorderType(() => {
        throw new Error("nope");
      }),
    ).toBeNull();
    expect(pickRecorderType(undefined)).toBeNull();
  });
});

describe("mime helpers", () => {
  it("strips codecs and lower-cases", () => {
    expect(baseMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseMimeType("Audio/MP4; codecs=mp4a.40.2")).toBe("audio/mp4");
  });

  it("names the clip by base type", () => {
    expect(clipFileName("audio/webm;codecs=opus")).toBe("clip.webm");
    expect(clipFileName("audio/mp4")).toBe("clip.m4a");
    expect(clipFileName("audio/wav")).toBe("clip.wav");
  });
});

describe("gestures (voice.md 1.2)", () => {
  it("cancels at 40 px left and locks at 40 px up", () => {
    expect(gestureFromDrag(-40, 0)).toBe("cancel");
    expect(gestureFromDrag(-39, 0)).toBeNull();
    expect(gestureFromDrag(0, -40)).toBe("lock");
    expect(gestureFromDrag(10, 30)).toBeNull();
    expect(gestureFromDrag(-50, -50)).toBe("cancel");
  });

  it("locks on a tap or a recording under 300 ms, sends otherwise", () => {
    expect(decideRelease({ press_ms: 120, recorded_ms: 100 })).toBe("lock");
    expect(decideRelease({ press_ms: 800, recorded_ms: null })).toBe("lock");
    expect(decideRelease({ press_ms: 800, recorded_ms: 250 })).toBe("lock");
    expect(decideRelease({ press_ms: 800, recorded_ms: 600 })).toBe("send");
  });

  it("formats the timer", () => {
    expect(formatTimer(0)).toBe("0:00");
    expect(formatTimer(6_400)).toBe("0:06");
    expect(formatTimer(25_000)).toBe("0:25");
    expect(formatTimer(61_000)).toBe("1:01");
  });
});

describe("classifyMicError (voice.md 6.1)", () => {
  it("maps browser error names to rows 1 to 3", () => {
    expect(classifyMicError({ name: "NotAllowedError" })).toBe("denied");
    expect(classifyMicError({ name: "NotFoundError" })).toBe("unavailable");
    expect(classifyMicError({ name: "NotReadableError" })).toBe("unavailable");
    expect(classifyMicError({ name: "OverconstrainedError" })).toBe("unavailable");
    expect(classifyMicError({ name: "NotSupportedError" })).toBe("unsupported");
    expect(classifyMicError(new Error("x"))).toBe("other");
    expect(classifyMicError(null)).toBe("other");
  });
});
