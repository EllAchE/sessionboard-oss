# Generated asset record

The seven transparent PNGs were produced on 2026-08-12 with OpenAI's built-in image-generation
workflow. Four used licensed local photographs as edit targets. Three were generated from text.
Simple chroma-key outputs were converted to alpha locally; model-native alpha outputs were retained.
Every final was composited over Cicero cream, charcoal, and vermilion surfaces before inclusion.

## Speaker headshot system

The speaker portraits use a deterministic SVG pipeline instead of 600 checked-in raster files. Its
art direction began with the owned ImageGen board at
[`docs/images/speaker-headshot-art-direction.webp`](../../../docs/images/speaker-headshot-art-direction.webp),
generated with OpenAI's built-in image-generation workflow on 2026-08-12:

```text
Use case: stylized-concept
Asset type: visual direction board for Cicero's deterministic speaker-headshot system
Primary request: Create one exact 4-by-4 contact sheet containing sixteen genuinely distinct, fictional Roman senator or classical-orator headshot portraits. Every tile must depict a different person, not variants of the same face.
Scene/backdrop: sixteen separate square tiles with equal clean gutters; each tile has a simple flat background drawn from warm limestone, terracotta, muted ochre, deep ink, olive, and restrained verdigris.
Subject: broad visual diversity across apparent age, facial proportions, skin tone, hair texture and style, facial hair, and draped senatorial attire; include women and men; fictional people only, no resemblance to public figures.
Style/medium: original matte cut-paper and shallow 3D bas-relief hybrid, refined museum-catalog editorial illustration, simplified geometric forms, subtle stone grain, cohesive across all tiles, visibly not photography.
Composition/framing: in every tile, a centered head-and-shoulders portrait at consistent scale; complete hair and shoulders visible; face and identifying features stay inside the central 70 percent safe circle so both square and circular avatar crops work; straight-on or restrained three-quarter poses.
Lighting/mood: soft sculptural side light contained within each portrait, calm and authoritative.
Color palette: warm limestone #E7DFCF, charcoal ink #292621, terracotta #B56A45, vermilion #B7391F, muted olive, restrained verdigris; varied skin and hair tones.
Materials/textures: matte carved stone, paper grain, understated patina.
Constraints: exactly sixteen portraits in an exact 4-by-4 grid; all sixteen faces clearly different; equal tile sizes and gutters; no shared subjects across tiles; no text, letters, numerals, labels, logos, borders, flags, weapons, modern clothing, photorealism, or watermark.
```

`lib/roman-speaker-headshots.ts` translates that direction into compact self-contained SVGs. For
slots 0–599, a coprime permutation covers every combination of ten face geometries, twelve hair
silhouettes, and five material/complexion families exactly once. Stable speaker-key hashing varies
garments, backdrops, hair color, facial hair, age, pose, accessories, and mosaic motifs. Slots past
599 keep rendering from their stable index and key; they lose the strict no-near-duplicate guarantee
but never fall back to a broken URL or repeated stock image.

Run `bun run verify:headshots` to check all 600 outputs for exact byte duplicates, repeated visual
signatures, a weighted near-duplicate threshold, and aggregate byte size. The development-only
`/roman-headshots` gallery alternates square and circular masks for manual crop review.

## Photo cutouts

Each cutout used the matching artifact WebP as its edit target and this request, with the subject
description specialized per file:

```text
Use case: background-extraction
Asset type: transparent Cicero theme cutout derived from an existing licensed museum photograph
Input images: Image 1 is the edit target, <subject>
Primary request: replace only the entire museum or studio background, floor, and cast shadow with a perfectly flat solid #00ff00 chroma-key background for local removal.
Constraints: preserve the artifact exactly, including its identity, proportions, crop, material texture, damage, color, lighting, and every silhouette edge. Keep the entire artifact visible with generous padding. The background must be one uniform #00ff00 with no shadows, gradients, texture, reflections, floor plane, or lighting variation. Do not alter, reconstruct, stylize, smooth, restore, repair, or relight the artifact. Do not use #00ff00 anywhere in the subject. No cast shadow, contact shadow, reflection, text, border, or watermark. Crisp faithful edges.
```

The toga prompt explicitly retained the integral stone plinth and removed the museum's red rail.
The capital prompt explicitly retained its grayscale tone and prohibited colorization.

## Speaker rostrum

```text
Use case: stylized-concept
Asset type: backgroundless Cicero theme illustration for onboarding, empty states, and editorial feature blocks
Primary request: an original classical Roman speaker's rostrum as a compact visual object: a low warm-travertine lectern with a shallow carved amphitheater arc, two rolled ivory programme sheets, and one narrow vermilion ribbon draped through the composition
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for local background removal
Style/medium: deliberately illustrated, matte cut-paper and shallow 3D bas-relief hybrid; refined museum-catalog editorial art; simplified geometric forms; visibly not a photograph
Composition/framing: centered three-quarter view, complete object visible, balanced asymmetry, generous padding, strong readable silhouette at small size
Lighting/mood: soft graphic value separation contained entirely within the object, calm and authoritative
Color palette: warm limestone #E7DFCF, charcoal ink #292621, terracotta #B56A45, restrained Cicero vermilion #B7391F
Materials/textures: subtle paper grain and carved stone texture, matte surfaces
Constraints: background must be one perfectly uniform #00ff00 with no shadows, gradients, texture, reflections, floor plane, or lighting variation; do not use #00ff00 in the subject; no cast shadow, no contact shadow, no glow, no text, no letters, no logo, no border, no watermark; crisp opaque edges and generous separation between parts
```

## Review tablets

```text
Use case: stylized-concept
Asset type: backgroundless Cicero theme illustration for review queues, scoring, and decision states
Primary request: an original pair of Roman wax writing tablets opened like a small book, with a short bronze stylus resting diagonally, four simple inset scoring tiles, and one decisive vermilion tile shifted forward; absolutely no writing or numerals
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for local background removal
Style/medium: deliberately illustrated, matte cut-paper and shallow 3D bas-relief hybrid; refined museum-catalog editorial art; simplified geometric forms; visibly not a photograph
Composition/framing: centered three-quarter top view, complete object visible, compact horizontal composition, generous padding, strong readable silhouette at small size
Lighting/mood: soft graphic value separation contained entirely within the object, thoughtful and precise
Color palette: warm ivory wax #E7DFCF, charcoal ink #292621, aged bronze #8C6B45, restrained Cicero vermilion #B7391F
Materials/textures: subtle paper grain, wax, and patinated metal rendered as matte illustration
Constraints: background must be one perfectly uniform #00ff00 with no shadows, gradients, texture, reflections, floor plane, or lighting variation; do not use #00ff00 in the subject; no cast shadow, no contact shadow, no glow, no text, no letters, no numerals, no logo, no border, no watermark; crisp opaque edges and generous separation between parts
```

## Agenda theatre

```text
Use case: stylized-concept
Asset type: backgroundless Cicero theme illustration for agenda building, programme publishing, and scheduling states
Primary request: an original isometric miniature Roman theatre transformed into an agenda metaphor: three semicircular tiers of warm stone seating divided into neat schedule blocks, a charcoal central aisle, and a single vermilion stage slab at the open edge
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for local background removal
Style/medium: deliberately illustrated, matte cut-paper and shallow 3D architectural-model hybrid; refined museum-catalog editorial art; simplified geometric forms; visibly not a photograph
Composition/framing: centered three-quarter isometric view, complete miniature visible, compact square composition, generous padding, strong readable silhouette at small size
Lighting/mood: soft graphic value separation contained entirely within the model, orderly and calm
Color palette: warm limestone #E7DFCF, charcoal ink #292621, terracotta #B56A45, restrained Cicero vermilion #B7391F
Materials/textures: subtle paper grain and carved-stone texture, matte surfaces
Constraints: background must be one perfectly uniform #00ff00 with no shadows, gradients, texture, reflections, floor plane, or lighting variation; do not use #00ff00 in the subject; no cast shadow, no contact shadow, no glow, no people, no text, no letters, no numerals, no logo, no border, no watermark; crisp opaque edges and generous separation between tiers
```
