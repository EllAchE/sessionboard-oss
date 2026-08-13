import { describe, expect, it } from "vitest";
import { loadRomanProfileArt, ROMAN_PROFILE_ART } from "./roman-profile-art";

describe("Roman profile art", () => {
  it("assigns a distinct image to every First Settlement speaker", () => {
    expect(ROMAN_PROFILE_ART).toHaveLength(6);
    expect(new Set(ROMAN_PROFILE_ART.map((entry) => entry.email)).size).toBe(6);
    expect(
      new Set(ROMAN_PROFILE_ART.map((entry) => entry.assetPath)).size,
    ).toBe(6);
  });

  it("loads each assignment as a WebP image", async () => {
    const images = await Promise.all(
      ROMAN_PROFILE_ART.map((entry) => loadRomanProfileArt(entry.assetPath)),
    );

    for (const image of images) {
      expect(new TextDecoder().decode(image.slice(0, 4))).toBe("RIFF");
      expect(new TextDecoder().decode(image.slice(8, 12))).toBe("WEBP");
    }
  });
});
