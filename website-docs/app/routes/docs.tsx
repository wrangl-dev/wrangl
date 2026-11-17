import browserCollections from 'collections/browser'
import { useFumadocsLoader } from 'fumadocs-core/source/client'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover
} from 'fumadocs-ui/layouts/docs/page'
import { getMDXComponents } from '@/components/mdx'
import { baseOptions } from '@/lib/layout.shared'
import { docsSiteUrl, gitConfig, ogImageUrl, xHandle } from '@/lib/shared'
import { getPageMarkdownUrl, source } from '@/lib/source'
import type { Route } from './+types/docs'

export async function loader({ params }: Route.LoaderArgs) {
  const slugs = (params['*'] ?? '').split('/').filter((v) => v.length > 0)
  const page = source.getPage(slugs)
  if (!page) throw new Response('Not found', { status: 404 })

  return {
    path: page.path,
    // Cloudflare Pages serves every page as a directory, so the trailing slash is the real URL.
    canonicalUrl: `${docsSiteUrl}${page.url.replace(/\/?$/, '/')}`,
    markdownUrl: getPageMarkdownUrl(page).url,
    pageTree: await source.serializePageTree(source.getPageTree())
  }
}

const mdxComponents = getMDXComponents()

const clientLoader = browserCollections.docs.createClientLoader({
  component(
    { toc, frontmatter, default: Mdx },
    {
      markdownUrl,
      path,
      canonicalUrl
    }: {
      markdownUrl: string
      path: string
      canonicalUrl: string
    }
  ) {
    const title = `${frontmatter.title} | Wrangl Docs`
    return (
      <DocsPage toc={toc}>
        <title>{title}</title>
        <meta name="description" content={frontmatter.description} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:site_name" content="Wrangl Docs" />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={frontmatter.description} />
        <meta property="og:image" content={ogImageUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content={xHandle} />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={frontmatter.description} />
        <meta name="twitter:image" content={ogImageUrl} />
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <div className="flex flex-row gap-2 items-center border-b -mt-4 pb-6">
          <MarkdownCopyButton markdownUrl={markdownUrl} />
          <ViewOptionsPopover
            markdownUrl={markdownUrl}
            githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/website-docs/content/docs/${path}`}
          />
        </div>
        <DocsBody>
          <Mdx components={mdxComponents} />
        </DocsBody>
      </DocsPage>
    )
  }
})

export default function Page({ loaderData }: Route.ComponentProps) {
  const { pageTree, path, markdownUrl, canonicalUrl } = useFumadocsLoader(loaderData)

  return (
    <DocsLayout {...baseOptions()} tree={pageTree}>
      {clientLoader.useContent(loaderData.path, {
        markdownUrl,
        path,
        canonicalUrl
      })}
    </DocsLayout>
  )
}
