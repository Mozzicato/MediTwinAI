import { describe, expect, it } from "vitest";
import { chunksForSpeech, pickVoice, speechText } from "@/lib/speech";

const voice = (name: string, lang: string, localService = true) => ({ name, lang, localService, default: false, voiceURI: name }) as SpeechSynthesisVoice;

describe("speechText", () => {
  it("says units, ranges and test names the way a person would", () => {
    expect(speechText("Your **HbA1c** is 7.1 %, above the reference range 4–5.6 %.", "en"))
      .toBe("Your H B A 1 C is 7.1 percent, above the reference range 4 to 5.6 percent.");
    expect(speechText("BP 148/94 mmHg and glucose 118 mg/dL", "en"))
      .toBe("BP 148 over 94 millimetres of mercury and glucose 118 milligrams per decilitre");
  });

  it("drops markdown bullets and turns lines into pauses", () => {
    expect(speechText("Two things:\n- **Rest**\n- Drink water", "en")).toBe("Two things:. Rest. Drink water");
  });

  it("leaves other languages' text alone apart from markdown", () => {
    expect(speechText("**HbA1c** rẹ jẹ 7.1 %", "yo")).toBe("HbA1c rẹ jẹ 7.1 %");
  });
});

describe("chunksForSpeech", () => {
  it("splits into sentences and breaks long ones at commas", () => {
    const long = `${"word ".repeat(30).trim()}, ${"more ".repeat(30).trim()}.`;
    const chunks = chunksForSpeech(`Short one. ${long} Last?`, 180);
    expect(chunks[0]).toBe("Short one.");
    expect(chunks.at(-1)).toBe("Last?");
    expect(chunks.every((c) => c.length <= 180)).toBe(true);
  });

  it("keeps decimals inside a sentence", () => {
    expect(chunksForSpeech("It is 7.1 percent. Good.")).toEqual(["It is 7.1 percent.", "Good."]);
  });
});

describe("pickVoice", () => {
  const list = [voice("Microsoft David", "en-US"), voice("Google UK English Female", "en-GB", false), voice("Microsoft Ezinne Online (Natural)", "en-NG", false)];

  it("prefers a natural Nigerian English voice for English and Pidgin", () => {
    expect(pickVoice("en", list).voice?.name).toBe("Microsoft Ezinne Online (Natural)");
    expect(pickVoice("pcm", list)).toMatchObject({ native: true });
  });

  it("falls back to English, and says so, when the device has no voice for the language", () => {
    expect(pickVoice("yo", list)).toMatchObject({ native: false, voice: { lang: "en-NG" } });
    expect(pickVoice("yo", [...list, voice("Yoruba", "yo-NG")])).toMatchObject({ native: true, voice: { name: "Yoruba" } });
  });
});
