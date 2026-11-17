import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'
import { appName, docsRoute, gitConfig, xUrl } from './shared'

// The official X logo mark.
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  )
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: appName,
      url: docsRoute
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: [
      { type: 'icon', label: 'Wrangl on X', text: 'X', url: xUrl, icon: <XIcon />, external: true }
    ]
  }
}
