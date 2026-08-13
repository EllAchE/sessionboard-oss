import Image from "next/image";
import { notFound } from "next/navigation";
import {
  CICERO_LOGO_ASSETS,
  CICERO_TRANSPARENT_ASSETS,
  type CiceroTransparentAsset,
} from "@/lib/cicero-visual-assets";
import {
  ROMAN_ASSETS,
  type RomanAsset,
  type RomanAssetCategory,
} from "@/lib/roman-assets";
import styles from "./roman-assets.module.css";

const CATEGORY_DETAILS: Record<
  RomanAssetCategory,
  { eyebrow: string; title: string; description: string }
> = {
  places: {
    eyebrow: "I · Loci",
    title: "Places & architecture",
    description:
      "Large-format scenes with crop room for landing pages, event covers, program headers, and sectional backgrounds.",
  },
  artifacts: {
    eyebrow: "II · Res",
    title: "Artifacts & ornament",
    description:
      "Portraits, drapery, inscriptions, mosaic, relief, and fresco for editorial cards and visual storytelling.",
  },
  materials: {
    eyebrow: "III · Materia",
    title: "Materials & botanicals",
    description:
      "Stone, terracotta, laurel, olive, and palm details for quiet surfaces, crops, overlays, and edge decoration.",
  },
};

function AssetCard({ asset }: { asset: RomanAsset }) {
  return (
    <article className={styles.card}>
      <div className={styles.imageFrame} data-orientation={asset.orientation}>
        <Image
          src={asset.path}
          alt={asset.alt}
          fill
          priority={asset.id === "constantine-colosseum"}
          unoptimized
          sizes="(max-width: 720px) 100vw, (max-width: 1200px) 50vw, 33vw"
          style={{ objectPosition: asset.focalPoint }}
        />
        <span className={styles.orientation}>{asset.orientation}</span>
      </div>
      <div className={styles.cardBody}>
        <div>
          <p className={styles.assetId}>{asset.id}</p>
          <h3 className={styles.assetName}>{asset.name}</h3>
        </div>
        <p className={styles.altText}>{asset.alt}</p>
        <div className={styles.tags} aria-label="Recommended uses">
          {asset.recommendedFor.map((use) => (
            <span className={styles.tag} key={use}>
              {use}
            </span>
          ))}
        </div>
        <dl className={styles.metadata}>
          <div>
            <dt>Focal point</dt>
            <dd>{asset.focalPoint}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              <a href={asset.source.pageUrl} target="_blank" rel="noreferrer">
                {asset.source.author}
              </a>
            </dd>
          </div>
          <div>
            <dt>License</dt>
            <dd>
              <a
                href={asset.source.licenseUrl}
                target="_blank"
                rel="noreferrer"
              >
                {asset.source.license}
              </a>
            </dd>
          </div>
          <div>
            <dt>Original</dt>
            <dd>{asset.source.originalDimensions}</dd>
          </div>
        </dl>
        {asset.source.accuracyNote ? (
          <p className={styles.accuracyNote}>{asset.source.accuracyNote}</p>
        ) : null}
        <code className={styles.path}>{asset.path}</code>
      </div>
    </article>
  );
}

function TransparentAssetCard({ asset }: { asset: CiceroTransparentAsset }) {
  return (
    <article className={styles.card}>
      <div className={styles.alphaFrame} data-orientation={asset.orientation}>
        <Image
          src={asset.path}
          alt={asset.alt}
          fill
          unoptimized
          sizes="(max-width: 720px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        <span className={styles.orientation}>transparent PNG</span>
      </div>
      <div className={styles.cardBody}>
        <div>
          <p className={styles.assetId}>{asset.id}</p>
          <h3 className={styles.assetName}>{asset.name}</h3>
        </div>
        <p className={styles.altText}>{asset.alt}</p>
        <div className={styles.tags} aria-label="Recommended uses">
          {asset.recommendedFor.map((use) => (
            <span className={styles.tag} key={use}>
              {use}
            </span>
          ))}
        </div>
        <dl className={styles.metadata}>
          <div>
            <dt>Type</dt>
            <dd>{asset.kind}</dd>
          </div>
          <div>
            <dt>Provenance</dt>
            <dd>{asset.provenance}</dd>
          </div>
        </dl>
        <code className={styles.path}>{asset.path}</code>
      </div>
    </article>
  );
}

export default function RomanAssetsPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Image
          src="/assets/roman/places/constantine-colosseum.webp"
          alt=""
          fill
          priority
          unoptimized
          sizes="100vw"
          className={styles.heroImage}
        />
        <div className={styles.heroShade} />
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Cicero visual archive · MMXXVI</p>
          <h1>Roman asset library</h1>
          <p className={styles.intro}>
            A curated collection of real places, artifacts, materials, and
            botanicals. Every image is web-optimized, crop-tested, and linked to
            its source.
          </p>
          <div className={styles.summary}>
            <span>{ROMAN_ASSETS.length} photographs</span>
            <span>{CICERO_TRANSPARENT_ASSETS.length} alpha assets</span>
            <span>{CICERO_LOGO_ASSETS.length} logo files</span>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <aside className={styles.guidance}>
          <p className={styles.guidanceLabel}>Art direction</p>
          <p>
            Favor warm stone, deep shadow, restrained vermilion, and crops with
            one clear subject. Keep transparent assets unboxed when possible;
            use photographs as fields and generated illustrations as editorial
            punctuation.
          </p>
        </aside>

        {(Object.keys(CATEGORY_DETAILS) as RomanAssetCategory[]).map(
          (category) => {
            const details = CATEGORY_DETAILS[category];
            const assets = ROMAN_ASSETS.filter(
              (asset) => asset.category === category,
            );

            return (
              <section className={styles.section} key={category}>
                <div className={styles.sectionHeading}>
                  <div>
                    <p className={styles.sectionEyebrow}>{details.eyebrow}</p>
                    <h2>{details.title}</h2>
                  </div>
                  <p>{details.description}</p>
                </div>
                <div className={styles.grid}>
                  {assets.map((asset) => (
                    <AssetCard asset={asset} key={asset.id} />
                  ))}
                </div>
              </section>
            );
          },
        )}

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>IV · Figurae</p>
              <h2>Transparent cutouts</h2>
            </div>
            <p>
              Faithful extractions of the strongest sculptural subjects in the
              photo library. They can overlap panels, anchor empty states, and
              cross light or dark surfaces without carrying a museum backdrop.
            </p>
          </div>
          <div className={styles.grid}>
            {CICERO_TRANSPARENT_ASSETS.filter(
              (asset) => asset.kind === "photo cutout",
            ).map((asset) => (
              <TransparentAssetCard asset={asset} key={asset.id} />
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>V · Instrumenta</p>
              <h2>Original illustrations</h2>
            </div>
            <p>
              Backgroundless editorial objects for Cicero&apos;s three core
              motions: invite the speaker, decide the programme, and publish the
              agenda. These are intentionally illustrated rather than synthetic
              photographs.
            </p>
          </div>
          <div className={styles.grid}>
            {CICERO_TRANSPARENT_ASSETS.filter(
              (asset) => asset.kind === "original illustration",
            ).map((asset) => (
              <TransparentAssetCard asset={asset} key={asset.id} />
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>VI · Signum</p>
              <h2>Logo system</h2>
            </div>
            <p>
              The default restores Cicero&apos;s original three-column symbol in a
              bordered square. Use the reversed version on charcoal or
              photography; the amphitheatre C remains available below as an
              alternate direction.
            </p>
          </div>
          <div className={styles.logoGrid}>
            {CICERO_LOGO_ASSETS.map((asset) => (
              <article className={styles.logoCard} key={asset.id}>
                <div className={styles.logoPreview} data-preview={asset.preview}>
                  <Image
                    src={asset.path}
                    alt={asset.name}
                    width={300}
                    height={96}
                    unoptimized
                  />
                </div>
                <div className={styles.cardBody}>
                  <div>
                    <p className={styles.assetId}>{asset.id}</p>
                    <h3 className={styles.assetName}>{asset.name}</h3>
                  </div>
                  <div className={styles.tags} aria-label="Recommended uses">
                    {asset.recommendedFor.map((use) => (
                      <span className={styles.tag} key={use}>
                        {use}
                      </span>
                    ))}
                  </div>
                  <code className={styles.path}>{asset.path}</code>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
