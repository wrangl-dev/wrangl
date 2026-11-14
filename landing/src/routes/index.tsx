import type { RouteObject } from 'react-router';

import { App } from '../App';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';
import { PrivacyPage } from './PrivacyPage';
import { TermsPage } from './TermsPage';

export const routes: RouteObject[] = [
  {
    path: '/',
    Component: App,
    children: [
      {
        index: true,
        Component: HomePage,
      },
      {
        path: 'privacy',
        Component: PrivacyPage,
      },
      {
        path: 'terms',
        Component: TermsPage,
      },
      {
        path: '*',
        Component: NotFoundPage,
      },
    ],
  },
];
