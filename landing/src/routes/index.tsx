import type { RouteObject } from 'react-router';

import { App } from '../App';
import { ChangelogPage } from '../pages/changelog-page';
import { FeaturesPage } from '../pages/features-page';
import { HomePage } from '../pages/home-page';
import { InstallPage } from '../pages/install-page';
import { NotFoundPage } from './NotFoundPage';
import { PrivacyPage } from './PrivacyPage';
import { TermsPage } from './TermsPage';

export const routes: RouteObject[] = [
  {
    path: '/',
    Component: App,
    children: [
      { index: true, Component: HomePage },
      { path: 'features', Component: FeaturesPage },
      { path: 'install', Component: InstallPage },
      { path: 'changelog', Component: ChangelogPage },
      { path: 'privacy', Component: PrivacyPage },
      { path: 'terms', Component: TermsPage },
      { path: '*', Component: NotFoundPage },
    ],
  },
];
