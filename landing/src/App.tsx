import { Outlet } from 'react-router';

import { SiteFooter } from './components/site/site-footer';
import { SiteHeader } from './components/site/site-header';

export function App() {
  return (
    <div className="site">
      <SiteHeader />
      <Outlet />
      <SiteFooter />
    </div>
  );
}
