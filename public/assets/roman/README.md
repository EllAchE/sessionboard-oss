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

The Cicero mark is an open C built from two amphitheatre tiers, with a vermilion stage at the open
edge. Product UI should use `CiceroBrand` so the stone/ink color follows the current theme and the
stage follows `--accent`.

- `cicero-mark.svg` — default mark on light surfaces;
- `cicero-mark-reversed.svg` — light mark for charcoal or photography;
- `cicero-lockup.svg` — mark and wordmark for external materials;
- `app/icon.svg` — product icon with the required bounded favicon surface.

Keep clear space equal to the stage width around the mark. Do not add a circle, microphone, eagle,
gradient, or drop shadow. The open right edge and vermilion stage are the identifying features.

See `GENERATION.md` for the prompt set and alpha-production workflow used for the generated assets.
