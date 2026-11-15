import {
  LegalLink,
  LegalList,
  LegalPage,
  LegalSection,
} from '../components/legal/LegalPage';
import { LEGAL_LAST_UPDATED } from '../lib/legal';
import { GITHUB_REPO_URL, ISSUES_URL } from '../lib/links';

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      description="What the Wrangl website loads, and what is and is not known about the Wrangl desktop app."
      path="/privacy/"
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <LegalSection title="Summary">
        <p>
          Wrangl is a free, open-source desktop app. This website (wrangl.dev)
          is a static site. It has no analytics, no cookies, and no forms, and
          it stores nothing about you. Details below.
        </p>
      </LegalSection>

      <LegalSection title="Website: third-party requests">
        <LegalList>
          <li>
            The home and features pages show live Robinhood Chain data. Your browser asks
            the public Robinhood Chain RPC (rpc.mainnet.chain.robinhood.com)
            for the latest block and gas price, and GeckoTerminal
            (api.geckoterminal.com) for the newest pools. Those services see
            your IP address. No other data is sent.
          </li>
          <li>The site uses your system fonts and loads no web fonts.</li>
          <li>
            The site sets the <code>Referrer-Policy: no-referrer</code>{' '}
            header.
          </li>
          <li>The site does not show a cookie banner because it sets no cookies.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Hosting">
        <p>
          The site is built for Cloudflare Pages. Cloudflare, as host, may
          process request logs such as IP addresses under its own policy. We
          did not verify the production hosting configuration beyond the
          repository.
        </p>
      </LegalSection>

      <LegalSection title="Desktop app">
        <LegalList>
          <li>
            In the app source (<LegalLink href={GITHUB_REPO_URL}>
              github.com/wrangl-dev/wrangl
            </LegalLink>) we did not find analytics, telemetry, or crash
            reporting libraries.
          </li>
          <li>
            The app includes the Tauri updater, configured to read{' '}
            <code>latest.json</code> from the project&apos;s GitHub releases.
            Checking for updates therefore contacts GitHub. The app also reads
            release notes from api.github.com. Exactly when automatic checks
            run was not verified.
          </li>
          <li>
            Your terminals, files, and projects stay on your machine. If you
            use features that connect elsewhere (AI coding agents, MCP
            servers, SSH, a browser pane, or the Wrangl server), the data you
            send goes to the service you chose, under that service&apos;s own
            policy. We did not audit each of these integrations for this page.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Questions">
        <p>
          To ask any privacy question, open an issue at{' '}
          <LegalLink href={ISSUES_URL}>{ISSUES_URL.replace('https://', '')}</LegalLink>.
          Please do not post private information in a public issue; say that
          you want to be contacted privately and a maintainer will reply on
          the issue. There is no dedicated privacy email address.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          This page lives in the open-source repository. Changes are made by
          pull request and the date above is updated.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
