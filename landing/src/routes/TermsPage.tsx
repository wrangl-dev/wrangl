import { LegalLink, LegalPage, LegalSection } from '../components/legal/LegalPage';
import { LEGAL_LAST_UPDATED } from '../lib/legal';
import { GITHUB_REPO_URL, ISSUES_URL, LICENSE_URL } from '../lib/links';

export function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      description="Terms for using the Wrangl app and website: MIT license, no warranty."
      path="/terms/"
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <LegalSection title="The Wrangl app">
        <p>
          Wrangl is free software released under the{' '}
          <LegalLink href={LICENSE_URL}>MIT License</LegalLink>. The license text in the repository
          is the authoritative document; if anything on this page differs from it, the license wins.
          Source code is at{' '}
          <LegalLink href={GITHUB_REPO_URL}>github.com/wrangl-dev/wrangl</LegalLink>.
        </p>
        <p>Wrangl is free to download and use. Nothing on this website asks for payment.</p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          The software is provided &quot;as is&quot;, without warranty of any kind, express or
          implied, including merchantability, fitness for a particular purpose, and
          non-infringement. The authors and copyright holders are not liable for any claim, damages,
          or other liability arising from the software or its use. This follows the MIT License.
        </p>
        <p>
          Wrangl can run terminals, edit files, run Git commands, and launch third-party AI coding
          agents that can run commands on your machine. You are responsible for what you run and for
          backing up your work.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          The only contact channel we list is the GitHub project:{' '}
          <LegalLink href={ISSUES_URL}>{ISSUES_URL.replace('https://', '')}</LegalLink>. Private
          vulnerability reporting is not enabled on the repository at the time of writing, so do not
          post security details in a public issue; ask there for a private way to reach a
          maintainer.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          These terms live in the open-source repository. Changes are made by pull request and the
          date above is updated.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
