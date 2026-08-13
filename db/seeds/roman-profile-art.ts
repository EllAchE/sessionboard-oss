import { readFile } from "node:fs/promises";

export const ROMAN_PROFILE_ART = [
  {
    email: "octavian@first-settlement.example",
    assetPath: "/assets/roman/artifacts/laurel-head.webp",
  },
  {
    email: "agrippa@first-settlement.example",
    assetPath: "/assets/roman/artifacts/germanicus-bust.webp",
  },
  {
    email: "plancus@first-settlement.example",
    assetPath: "/assets/roman/artifacts/toga-statue.webp",
  },
  {
    email: "messalla@first-settlement.example",
    assetPath: "/assets/roman/artifacts/constantine-relief.webp",
  },
  {
    email: "maecenas@first-settlement.example",
    assetPath: "/assets/roman/artifacts/villa-mysteries-fresco.webp",
  },
  {
    email: "taurus@first-settlement.example",
    assetPath: "/assets/roman/artifacts/gold-laurel-wreath.webp",
  },
] as const;

export async function loadRomanProfileArt(
  assetPath: string,
): Promise<Uint8Array> {
  return readFile(new URL(`../../public${assetPath}`, import.meta.url));
}
