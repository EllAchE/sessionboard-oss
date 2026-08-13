# Cicero Roman asset library

Twenty-six real photographs of Roman places, artifacts, materials, and related classical motifs,
curated for Cicero's demo surfaces. Images are stored as stripped WebP masters and grouped by use:

- `places/` — heroes, mastheads, program covers, and wide section backgrounds;
- `artifacts/` — portraits, drapery, ornament, inscriptions, fresco, and mosaic;
- `materials/` — foliage and surface textures for crops, overlays, and quiet panels.

The source of truth for names, alt text, focal points, recommended uses, and provenance is
`lib/roman-assets.ts`. The complete library can be reviewed locally at `/roman-assets`; the route
returns a 404 outside development builds.

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
