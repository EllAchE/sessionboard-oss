export const ROMAN_SPEAKER_HEADSHOT_CAPACITY = 600;

const FACE_COUNT = 10;
const HAIR_COUNT = 12;
const MATERIAL_COUNT = 5;

type Material = {
  skin: string;
  light: string;
  shadow: string;
  line: string;
};

export type RomanSpeakerHeadshotDesign = {
  slot: number;
  guaranteedDistinct: boolean;
  face: number;
  hair: number;
  material: number;
  hairColor: number;
  garment: number;
  backdrop: number;
  accessory: number;
  beard: number;
  nose: number;
  eyes: number;
  age: number;
  pose: number;
  motif: number;
  signature: string;
};

const MATERIALS: readonly Material[] = [
  { skin: '#C98658', light: '#E6B487', shadow: '#875035', line: '#493125' },
  { skin: '#6F4432', light: '#A86F50', shadow: '#41291F', line: '#211A17' },
  { skin: '#D8B08A', light: '#EED2B5', shadow: '#966C4F', line: '#594236' },
  { skin: '#B87950', light: '#D9A276', shadow: '#74462F', line: '#432D24' },
  { skin: '#D5CEC0', light: '#F0ECE3', shadow: '#8F887C', line: '#4B4842' },
];

const HAIR_COLORS = [
  '#231B18',
  '#3B2922',
  '#5A3825',
  '#7A4E2C',
  '#A48968',
  '#D5CEC0',
] as const;

const BACKDROPS = [
  ['#E7DFCF', '#B56A45'],
  ['#B56A45', '#E7DFCF'],
  ['#292621', '#B56A45'],
  ['#6E7250', '#E7DFCF'],
  ['#4E7773', '#D7A85C'],
  ['#C69249', '#292621'],
  ['#7A3B2B', '#D8B08A'],
  ['#A8A18F', '#4E7773'],
] as const;

const GARMENTS = [
  ['#E7DFCF', '#A69B87'],
  ['#B56A45', '#7A3B2B'],
  ['#4E7773', '#315552'],
  ['#6E7250', '#4A5038'],
  ['#C69249', '#8B632E'],
  ['#292621', '#4B4741'],
  ['#D8C7A8', '#8F7958'],
  ['#8D5661', '#5D3941'],
] as const;

const FACE_GEOMETRY = [
  { half: 43, cheek: 41, chin: 27, top: 52, bottom: 177 },
  { half: 47, cheek: 44, chin: 31, top: 49, bottom: 178 },
  { half: 41, cheek: 39, chin: 25, top: 55, bottom: 181 },
  { half: 50, cheek: 47, chin: 34, top: 50, bottom: 175 },
  { half: 45, cheek: 43, chin: 24, top: 47, bottom: 183 },
  { half: 48, cheek: 40, chin: 29, top: 54, bottom: 179 },
  { half: 42, cheek: 45, chin: 30, top: 51, bottom: 174 },
  { half: 46, cheek: 42, chin: 35, top: 48, bottom: 180 },
  { half: 44, cheek: 38, chin: 26, top: 53, bottom: 176 },
  { half: 49, cheek: 46, chin: 28, top: 46, bottom: 182 },
] as const;

function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function pick(seed: number, salt: number, size: number): number {
  return mix32(seed ^ Math.imul(salt, 0x9e3779b1)) % size;
}

function permutedSlot(slot: number): number {
  if (slot < ROMAN_SPEAKER_HEADSHOT_CAPACITY) {
    // 137 and 600 are coprime, so every guaranteed slot receives one unique
    // face × hair × material combination while neighboring speakers look unrelated.
    return (slot * 137 + 53) % ROMAN_SPEAKER_HEADSHOT_CAPACITY;
  }
  return mix32(slot) % ROMAN_SPEAKER_HEADSHOT_CAPACITY;
}

export function designRomanSpeakerHeadshot(
  speakerKey: string,
  slot: number,
): RomanSpeakerHeadshotDesign {
  if (!Number.isSafeInteger(slot) || slot < 0) {
    throw new RangeError('Speaker headshot slots must be non-negative safe integers.');
  }

  const permutation = permutedSlot(slot);
  const seed = mix32(hashString(speakerKey) ^ Math.imul(slot + 1, 0x85ebca6b));
  const face = permutation % FACE_COUNT;
  const hair = Math.floor(permutation / FACE_COUNT) % HAIR_COUNT;
  const material = Math.floor(permutation / (FACE_COUNT * HAIR_COUNT)) % MATERIAL_COUNT;
  const design = {
    slot,
    guaranteedDistinct: slot < ROMAN_SPEAKER_HEADSHOT_CAPACITY,
    face,
    hair,
    material,
    hairColor: pick(seed, 1, HAIR_COLORS.length),
    garment: pick(seed, 2, GARMENTS.length),
    backdrop: pick(seed, 3, BACKDROPS.length),
    accessory: pick(seed, 4, 6),
    beard: pick(seed, 5, 6),
    nose: pick(seed, 6, 7),
    eyes: pick(seed, 7, 6),
    age: pick(seed, 8, 5),
    pose: pick(seed, 9, 3) - 1,
    motif: pick(seed, 10, 8),
  };

  return {
    ...design,
    signature: [
      design.face,
      design.hair,
      design.material,
      design.hairColor,
      design.garment,
      design.backdrop,
      design.accessory,
      design.beard,
      design.nose,
      design.eyes,
      design.age,
      design.pose,
      design.motif,
    ].join(':'),
  };
}

export function romanSpeakerHeadshotVisualDistance(
  left: RomanSpeakerHeadshotDesign,
  right: RomanSpeakerHeadshotDesign,
): number {
  const weights: ReadonlyArray<[keyof RomanSpeakerHeadshotDesign, number]> = [
    ['face', 4],
    ['hair', 5],
    ['material', 3],
    ['hairColor', 1],
    ['garment', 2],
    ['backdrop', 2],
    ['accessory', 2],
    ['beard', 2],
    ['nose', 1],
    ['eyes', 1],
    ['age', 1],
    ['pose', 1],
    ['motif', 1],
  ];
  return weights.reduce(
    (distance, [trait, weight]) => distance + (left[trait] === right[trait] ? 0 : weight),
    0,
  );
}

function facePath(face: number): string {
  const shape = FACE_GEOMETRY[face];
  const left = 128 - shape.half;
  const right = 128 + shape.half;
  const cheekLeft = 128 - shape.cheek;
  const cheekRight = 128 + shape.cheek;
  const chinLeft = 128 - shape.chin;
  const chinRight = 128 + shape.chin;
  return [
    `M 128 ${shape.top}`,
    `C ${left + 6} ${shape.top}, ${left} 73, ${left} 101`,
    `C ${left} 125, ${cheekLeft} 147, ${chinLeft} 168`,
    `C ${chinLeft + 7} ${shape.bottom}, ${chinRight - 7} ${shape.bottom}, ${chinRight} 168`,
    `C ${cheekRight} 147, ${right} 125, ${right} 101`,
    `C ${right} 73, ${right - 6} ${shape.top}, 128 ${shape.top}`,
    'Z',
  ].join(' ');
}

function backgroundPattern(design: RomanSpeakerHeadshotDesign, accent: string): string {
  const offset = 8 + (design.slot % 19);
  switch (design.motif) {
    case 0:
      return `<circle cx="128" cy="126" r="94" fill="none" stroke="${accent}" stroke-width="2" opacity=".3"/><circle cx="128" cy="126" r="76" fill="none" stroke="${accent}" stroke-width="1" opacity=".2"/>`;
    case 1:
      return `<path d="M30 226V88Q128 -2 226 88V226" fill="none" stroke="${accent}" stroke-width="10" opacity=".18"/>`;
    case 2:
      return Array.from({ length: 7 }, (_, index) => {
        const x = 22 + index * 36;
        return `<path d="M${x} 0L${x + 20} 128L${x} 256" fill="none" stroke="${accent}" stroke-width="8" opacity=".12"/>`;
      }).join('');
    case 3:
      return Array.from({ length: 12 }, (_, index) => {
        const x = 18 + ((index * 47 + offset) % 220);
        const y = 16 + ((index * 71 + offset * 3) % 224);
        return `<circle cx="${x}" cy="${y}" r="${3 + (index % 3)}" fill="${accent}" opacity=".18"/>`;
      }).join('');
    case 4:
      return `<path d="M0 ${44 + offset}H256M0 ${92 + offset}H256M0 ${140 + offset}H256M0 ${188 + offset}H256" stroke="${accent}" stroke-width="3" opacity=".14"/>`;
    case 5:
      return `<path d="M22 230L128 18L234 230ZM55 230L128 82L201 230Z" fill="none" stroke="${accent}" stroke-width="4" opacity=".16"/>`;
    case 6:
      return Array.from({ length: 10 }, (_, index) => {
        const x = index < 5 ? 26 + index * 14 : 230 - (index - 5) * 14;
        const y = 65 + (index % 5) * 31;
        const rotation = index < 5 ? -28 : 28;
        return `<ellipse cx="${x}" cy="${y}" rx="5" ry="12" fill="${accent}" opacity=".2" transform="rotate(${rotation} ${x} ${y})"/>`;
      }).join('');
    default:
      return `<path d="M0 ${64 + offset}L${64 + offset} 0M0 ${128 + offset}L${128 + offset} 0M${128 - offset} 256L256 ${128 - offset}M${192 - offset} 256L256 ${192 - offset}" stroke="${accent}" stroke-width="12" opacity=".11"/>`;
  }
}

function hairMarkup(
  design: RomanSpeakerHeadshotDesign,
  hair: string,
  line: string,
): string {
  const curls = (count: number, startX: number, y: number, radius: number) =>
    Array.from({ length: count }, (_, index) => {
      const cx = startX + index * ((256 - startX * 2) / Math.max(1, count - 1));
      const cy = y + ((index + design.slot) % 2) * 5;
      return `<circle cx="${cx.toFixed(1)}" cy="${cy}" r="${radius}" fill="${hair}" stroke="${line}" stroke-width="2"/>`;
    }).join('');

  switch (design.hair) {
    case 0:
      return `<path d="M86 78Q128 35 170 78Q155 58 128 58Q101 58 86 78Z" fill="${hair}" opacity=".72"/>`;
    case 1:
      return curls(9, 85, 58, 10) + curls(8, 91, 72, 9);
    case 2:
      return `<path d="M83 83Q84 42 128 40Q175 43 173 88Q158 69 143 62Q126 84 105 61Q95 76 83 83Z" fill="${hair}" stroke="${line}" stroke-width="3"/>`;
    case 3:
      return curls(8, 82, 51, 13) + curls(9, 79, 71, 12);
    case 4:
      return `<path d="M84 78Q92 43 128 42Q165 43 173 79" fill="none" stroke="${hair}" stroke-width="22" stroke-linecap="round"/>${curls(7, 88, 54, 8)}`;
    case 5:
      return `<path d="M84 76Q94 37 130 40Q170 43 174 82L178 153Q161 142 163 102Q145 68 128 60Q108 66 93 98Q94 139 78 154L84 76Z" fill="${hair}" stroke="${line}" stroke-width="3"/>`;
    case 6:
      return `<circle cx="164" cy="56" r="27" fill="${hair}" stroke="${line}" stroke-width="3"/>${curls(8, 84, 58, 11)}`;
    case 7:
      return `<path d="M84 78Q92 42 128 40Q165 42 173 78" fill="${hair}" stroke="${line}" stroke-width="3"/>${Array.from({ length: 9 }, (_, index) => {
        const x = 84 + index * 11;
        const length = 35 + ((index * 13 + design.slot) % 34);
        return `<path d="M${x} 62Q${x - 5} ${80 + length / 2} ${x + (index % 2 ? 4 : -4)} ${82 + length}" fill="none" stroke="${hair}" stroke-width="7" stroke-linecap="round"/>`;
      }).join('')}`;
    case 8:
      return `<path d="M83 84Q86 43 126 39Q159 38 174 68Q142 54 104 86Q95 92 83 84Z" fill="${hair}" stroke="${line}" stroke-width="3"/><path d="M126 40Q118 61 95 78" fill="none" stroke="${line}" stroke-width="3" opacity=".5"/>`;
    case 9:
      return `<path d="M72 174Q69 85 85 56Q104 27 128 29Q155 29 176 58Q187 91 184 174L165 151V90Q153 55 128 52Q102 55 90 90V151L72 174Z" fill="${GARMENTS[design.garment][0]}" stroke="${GARMENTS[design.garment][1]}" stroke-width="4"/>`;
    case 10:
      return `<path d="M83 81Q92 48 112 43Q128 36 144 43Q165 49 174 81Q151 69 128 72Q105 69 83 81Z" fill="${hair}" stroke="${line}" stroke-width="3"/><path d="M128 40V70" stroke="${line}" stroke-width="2" opacity=".5"/>`;
    default:
      return `<path d="M82 83Q85 40 128 39Q171 40 174 83Q155 66 128 62Q101 66 82 83Z" fill="${hair}" stroke="${line}" stroke-width="3"/>${curls(5, 96, 52, 8)}`;
  }
}

function beardMarkup(design: RomanSpeakerHeadshotDesign, hair: string, line: string): string {
  switch (design.beard) {
    case 1:
      return `<path d="M99 139Q128 159 157 139Q153 178 128 186Q103 177 99 139Z" fill="${hair}" opacity=".3"/>`;
    case 2:
      return `<path d="M98 137Q128 151 158 137Q155 174 128 184Q101 174 98 137Z" fill="${hair}" stroke="${line}" stroke-width="2"/>`;
    case 3:
      return `<path d="M94 130Q104 184 128 197Q153 184 162 130Q151 148 128 151Q105 148 94 130Z" fill="${hair}" stroke="${line}" stroke-width="3"/>${Array.from({ length: 5 }, (_, index) => `<path d="M${108 + index * 10} 151L${112 + index * 8} ${181 + (index % 2) * 5}" stroke="${line}" stroke-width="2" opacity=".45"/>`).join('')}`;
    case 4:
      return `<path d="M113 150Q128 164 143 150L138 183Q128 192 118 183Z" fill="${hair}" stroke="${line}" stroke-width="2"/>`;
    case 5:
      return `<path d="M104 144Q118 136 128 145Q138 136 152 144Q139 156 128 150Q117 156 104 144Z" fill="${hair}"/>`;
    default:
      return '';
  }
}

function accessoryMarkup(
  design: RomanSpeakerHeadshotDesign,
  accent: string,
  line: string,
): string {
  switch (design.accessory) {
    case 1:
      return `<path d="M84 73Q128 48 172 73" fill="none" stroke="${accent}" stroke-width="5"/>`;
    case 2:
      return Array.from({ length: 10 }, (_, index) => {
        const left = index < 5;
        const step = index % 5;
        const x = left ? 94 + step * 8 : 162 - step * 8;
        const y = 69 - step * 6;
        const rotation = left ? -38 : 38;
        return `<ellipse cx="${x}" cy="${y}" rx="4" ry="10" fill="${accent}" stroke="${line}" stroke-width="1" transform="rotate(${rotation} ${x} ${y})"/>`;
      }).join('');
    case 3:
      return `<circle cx="${82 - design.pose * 2}" cy="126" r="5" fill="${accent}" stroke="${line}" stroke-width="2"/><path d="M82 131L82 145" stroke="${accent}" stroke-width="3"/>`;
    case 4:
      return `<circle cx="184" cy="205" r="13" fill="${accent}" stroke="${line}" stroke-width="3"/><path d="M178 205H190M184 199V211" stroke="${line}" stroke-width="2" opacity=".55"/>`;
    case 5:
      return `<path d="M91 78Q128 59 165 78" fill="none" stroke="${accent}" stroke-width="3"/><circle cx="128" cy="65" r="5" fill="${accent}" stroke="${line}" stroke-width="2"/>`;
    default:
      return '';
  }
}

function faceDetails(
  design: RomanSpeakerHeadshotDesign,
  material: Material,
  hair: string,
): string {
  const eyeSpacing = 19 + design.eyes;
  const eyeY = 111 + (design.eyes % 2);
  const eyeWidth = 9 + (design.eyes % 3);
  const noseLength = 20 + design.nose * 2;
  const noseWidth = 5 + (design.nose % 4);
  const mouthWidth = 13 + ((design.slot + design.face) % 8);
  const gaze = design.pose * 1.5;
  const wrinkles = Array.from({ length: design.age }, (_, index) => {
    const y = 91 - index * 5;
    return `<path d="M108 ${y}Q128 ${y - 3} 148 ${y}" fill="none" stroke="${material.line}" stroke-width="1.2" opacity=".24"/>`;
  }).join('');

  return `${wrinkles}
    <path d="M${128 - eyeSpacing - eyeWidth} ${eyeY - 8}Q${128 - eyeSpacing} ${eyeY - 13} ${128 - eyeSpacing + eyeWidth} ${eyeY - 8}" fill="none" stroke="${hair}" stroke-width="4" stroke-linecap="round"/>
    <path d="M${128 + eyeSpacing - eyeWidth} ${eyeY - 8}Q${128 + eyeSpacing} ${eyeY - 13} ${128 + eyeSpacing + eyeWidth} ${eyeY - 8}" fill="none" stroke="${hair}" stroke-width="4" stroke-linecap="round"/>
    <path d="M${128 - eyeSpacing - eyeWidth} ${eyeY}Q${128 - eyeSpacing} ${eyeY + 5} ${128 - eyeSpacing + eyeWidth} ${eyeY}" fill="none" stroke="${material.line}" stroke-width="2.4"/>
    <path d="M${128 + eyeSpacing - eyeWidth} ${eyeY}Q${128 + eyeSpacing} ${eyeY + 5} ${128 + eyeSpacing + eyeWidth} ${eyeY}" fill="none" stroke="${material.line}" stroke-width="2.4"/>
    <circle cx="${128 - eyeSpacing + gaze}" cy="${eyeY + 1}" r="2.5" fill="${material.line}"/>
    <circle cx="${128 + eyeSpacing + gaze}" cy="${eyeY + 1}" r="2.5" fill="${material.line}"/>
    <path d="M128 ${eyeY + 3}Q${126 - noseWidth} ${eyeY + noseLength} ${128 - noseWidth} ${eyeY + noseLength + 8}Q128 ${eyeY + noseLength + 12} ${128 + noseWidth} ${eyeY + noseLength + 8}" fill="none" stroke="${material.line}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M${128 - mouthWidth} 151Q128 ${154 + (design.slot % 3)} ${128 + mouthWidth} 151Q128 161 ${128 - mouthWidth} 151Z" fill="${material.shadow}" opacity=".78" stroke="${material.line}" stroke-width="1.5"/>`;
}

export function renderRomanSpeakerHeadshot(speakerKey: string, slot: number): string {
  const design = designRomanSpeakerHeadshot(speakerKey, slot);
  const material = MATERIALS[design.material];
  const hair = HAIR_COLORS[design.hairColor];
  const [background, backgroundAccent] = BACKDROPS[design.backdrop];
  const [garment, garmentShadow] = GARMENTS[design.garment];
  const shape = FACE_GEOMETRY[design.face];
  const face = facePath(design.face);
  const id = `cicero-${slot}-${hashString(speakerKey).toString(16)}`;
  const poseX = design.pose * 4;
  const facets = Array.from({ length: 9 }, (_, index) => {
    const x = 90 + ((index * 31 + design.slot * 7) % 76);
    const y = 67 + ((index * 43 + design.slot * 5) % 91);
    const width = 15 + ((index * 7 + design.face) % 20);
    return `<path d="M${x} ${y}L${x + width} ${y + 7}L${x + Math.floor(width / 2)} ${y + 28}Z" fill="${index % 2 ? material.light : material.shadow}" opacity=".1"/>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Fictional classical speaker portrait">
  <defs>
    <linearGradient id="${id}-background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${background}"/>
      <stop offset="1" stop-color="${backgroundAccent}" stop-opacity=".72"/>
    </linearGradient>
    <linearGradient id="${id}-skin" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${material.light}"/>
      <stop offset=".55" stop-color="${material.skin}"/>
      <stop offset="1" stop-color="${material.shadow}"/>
    </linearGradient>
    <linearGradient id="${id}-garment" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${garment}"/>
      <stop offset="1" stop-color="${garmentShadow}"/>
    </linearGradient>
    <clipPath id="${id}-face-clip"><path d="${face}"/></clipPath>
    <filter id="${id}-grain" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="2" seed="${1 + (slot % 97)}" result="noise"/>
      <feColorMatrix in="noise" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .1 0" result="grain"/>
      <feBlend in="SourceGraphic" in2="grain" mode="multiply"/>
    </filter>
  </defs>
  <rect width="256" height="256" rx="18" fill="url(#${id}-background)"/>
  ${backgroundPattern(design, backgroundAccent)}
  <g transform="translate(${poseX} 0)" filter="url(#${id}-grain)">
    <path d="M19 256Q28 205 76 189Q100 181 106 166H150Q156 181 180 189Q228 205 237 256Z" fill="url(#${id}-garment)" stroke="${material.line}" stroke-width="4"/>
    <path d="M40 256Q58 210 100 194L128 228L156 194Q199 210 216 256" fill="none" stroke="${garmentShadow}" stroke-width="18" opacity=".72"/>
    <path d="M105 160L101 205Q128 224 155 205L151 160Z" fill="url(#${id}-skin)" stroke="${material.line}" stroke-width="3"/>
    <ellipse cx="${128 - shape.half - 1}" cy="119" rx="11" ry="18" fill="${material.skin}" stroke="${material.line}" stroke-width="3"/>
    <ellipse cx="${128 + shape.half + 1}" cy="119" rx="11" ry="18" fill="${material.skin}" stroke="${material.line}" stroke-width="3"/>
    <path d="${face}" fill="url(#${id}-skin)" stroke="${material.line}" stroke-width="3.5"/>
    <g clip-path="url(#${id}-face-clip)">${facets}</g>
    ${hairMarkup(design, hair, material.line)}
    ${faceDetails(design, material, hair)}
    ${beardMarkup(design, hair, material.line)}
    ${accessoryMarkup(design, '#C69249', material.line)}
    <path d="M71 251Q95 215 128 229Q161 215 185 251" fill="none" stroke="${garment}" stroke-width="12" opacity=".78"/>
  </g>
  <rect x="5" y="5" width="246" height="246" rx="15" fill="none" stroke="${backgroundAccent}" stroke-width="2" opacity=".24"/>
</svg>`;
}

export function romanSpeakerHeadshotBytes(speakerKey: string, slot: number): Uint8Array {
  return new TextEncoder().encode(renderRomanSpeakerHeadshot(speakerKey, slot));
}
