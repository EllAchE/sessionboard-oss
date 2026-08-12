import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { EmbedBody } from '../../EmbedBody';
import {
  EMBED_VIEW_LABEL,
  isEmbedView,
  loadPublicBundle,
  parseEmbedOptions,
} from '../../queries';

export const dynamic = 'force-dynamic';

type Params = { slug: string; view: string };
type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug, view } = await params;
  if (!isEmbedView(view)) return { title: 'Cicero' };
  return { title: `${EMBED_VIEW_LABEL[view]} · ${slug}`, robots: { index: false } };
}

/**
 * `G-1`–`G-3`. One route for all five widgets: they read the same bundle and differ only in layout,
 * so a fix to the published-only filter cannot land on four of them and miss the fifth.
 */
export default async function EmbedViewPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [{ slug, view }, search] = await Promise.all([params, searchParams]);
  if (!isEmbedView(view)) notFound();

  const bundle = await loadPublicBundle(slug);
  if (!bundle) notFound();

  return <EmbedBody view={view} bundle={bundle} options={parseEmbedOptions(search)} />;
}
