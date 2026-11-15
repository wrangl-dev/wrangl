import { useHead, useSeoMeta } from '@unhead/react';

const SITE = 'https://wrangl.dev';
const OG_IMAGE = `${SITE}/og-image.png`;

type PageMeta = {
  title: string;
  description: string;
  /** Path with leading and trailing slash, e.g. "/features/". Omit for pages without a canonical. */
  path?: string;
  robots?: string;
};

/** Title, description, canonical and social tags for one page. */
export function usePageMeta({ title, description, path, robots }: PageMeta) {
  const url = path ? `${SITE}${path}` : undefined;
  useSeoMeta({
    title,
    description,
    robots,
    ogSiteName: 'Wrangl',
    ogType: 'website',
    ogUrl: url,
    ogTitle: title,
    ogDescription: description,
    ogImage: OG_IMAGE,
    ogImageWidth: 1200,
    ogImageHeight: 630,
    ogImageAlt: title,
    twitterCard: 'summary_large_image',
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: OG_IMAGE,
  });
  useHead({
    link: url ? [{ rel: 'canonical', href: url }] : [],
  });
}
