# Cicero visual asset library

Twenty-six real photographs of Roman places, artifacts, materials, and related classical motifs,
curated for Cicero's demo surfaces, now paired with four photo-derived cutouts, three original
illustrations, and a small vector logo system. Every added asset has a transparent background.

The photography is stored as stripped WebP masters and grouped by use:

- `places/` — heroes, mastheads, program covers, and wide section backgrounds;
- `artifacts/` — portraits, drapery, ornament, inscriptions, fresco, and mosaic;
- `materials/` — foliage and surface textures for crops, overlays, and quiet panels.

The transparent layer is grouped by intent:

- `cutouts/` — AI-assisted background extractions from four licensed artifact photographs;
- `illustrations/` — original editorial objects for speakers, review, and scheduling;
- `/public/brand/` — the Cicero mark, reversed mark, and horizontal lockup as SVG.

Speaker headshots are a deterministic generated system rather than a folder of repeated photos.
`lib/roman-speaker-headshots.ts` defines 600 guaranteed-distinct, square- and circle-safe fictional
classical portraits, then continues with a stable fallback for larger rosters. The seed renders only
the slots it needs, so adding capacity does not add 600 network requests or binary files to a build.
Review the complete set ten pages at a time at `/roman-headshots` in a development build.

The sources of truth for names, alt text, focal points, recommended uses, and provenance are
`lib/roman-assets.ts` and `lib/cicero-visual-assets.ts`. The complete library can be reviewed locally
at `/roman-assets`; the route returns a 404 outside development builds.

## Usage

Prefer the manifest over hard-coded paths:

```tsx
import Image from "next/image";
import { ROMAN_ASSET_BY_ID } from "@/lib/roman-assets";

const hero = ROMAN_ASSET_BY_ID["constantine-colosseum"];

<Image
  src={hero.path}
  alt={hero.alt}
  fill
  sizes="100vw"
  style={{ objectFit: "cover", objectPosition: hero.focalPoint }}
/>;
```

For background text, use a dark gradient at 70–88% opacity on the text side. Avoid baking overlays,
type, or brand color into the image files so the same asset remains useful in light and dark themes.

Recommended starting points:

- `constantine-colosseum` — strongest general-purpose hero;
- `appian-way` — quieter, directional hero with room for copy;
- `constantine-night` — evening programs and dark-mode surfaces;
- `roman-forum` and `pont-du-gard` — ultrawide mastheads and dividers;
- `germanicus-bust`, `laurel-head`, and `toga-statue` — portrait cards;
- `mosaic-floor`, `travertine`, and `carrara-marble` — low-contrast supporting surfaces.

See `ATTRIBUTION.md` before reusing an image outside the demo. The gold laurel wreath is a
Hellenistic Greek object included as an explicitly labeled classical reference, not represented as
a Roman artifact.

## Transparent assets

Use the typed manifest instead of hard-coded paths:

```tsx
import Image from "next/image";
import { CICERO_TRANSPARENT_ASSETS } from "@/lib/cicero-visual-assets";

const reviewArt = CICERO_TRANSPARENT_ASSETS.find(
  (asset) => asset.id === "review-tablets",
);

{reviewArt ? (
  <Image src={reviewArt.path} alt={reviewArt.alt} width={736} height={534} />
) : null}
```

Cutouts work best when allowed to break a card edge or sit beside copy. Do not put them back inside
photo-shaped rectangles. The illustrations are deliberately more polished and symbolic; use them
for onboarding, empty states, and editorial feature panels rather than historical evidence.

## Logo

The default Cicero mark restores the original three-column symbol inside a bordered square. It was
first used in the product UI as Lucide's `Columns3` icon before the standalone logo assets were
introduced. Product UI should use `CiceroBrand` so the tile surface, border, and symbol follow the
current theme.

- `cicero-mark.svg` — default mark on light surfaces;
- `cicero-mark-reversed.svg` — light mark for charcoal or photography;
- `cicero-lockup.svg` — mark and wordmark for external materials;
- `cicero-amphitheatre-*.svg` — retained alternate assets from the newer open-C direction;
- `app/icon.svg` — product icon and favicon using the default columns mark.

Keep clear space around the bordered tile and preserve all three columns at small sizes. Do not add
a circle, microphone, eagle, gradient, or drop shadow.

See `GENERATION.md` for the prompt set, deterministic headshot system, and alpha-production workflow
used for the generated assets.
