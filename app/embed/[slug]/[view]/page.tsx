import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { EmbedBody, type EmbedView } from '../../EmbedBody';
import { loadPublicBundle, parseEmbedOptions } from '../../queries';

export const dynamic = 'force-dynamic';

const VIEWS: Record<string, EmbedView> = {
  agenda: 'agenda',
  speakers: 'speakers',
  sessions: 'sessions',
};

const TITLES: Record<EmbedView, string> = {
  agenda: 'Agenda',
  speakers: 'Speakers',
  sessions: 'Sessions',
};

type Params = { slug: string; view: string };
type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug, view } = await params;
  const known = VIEWS[view];
  if (!known) return { title: 'Cicero' };
  return { title: `${TITLES[known]} · ${slug}`, robots: { index: false } };
}

/**
 * `G-1`, `G-2`, `G-3`. One route for all three views: they read the same bundle and differ only in
 * layout, so a fix to the published-only filter cannot land on two of them and miss the third.
 */
export default async function EmbedViewPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [{ slug, view }, search] = await Promise.all([params, searchParams]);
  const known = VIEWS[view];
  if (!known) notFound();

  const bundle = await loadPublicBundle(slug);
  if (!bundle) notFound();

  return <EmbedBody view={known} bundle={bundle} options={parseEmbedOptions(search)} />;
}
