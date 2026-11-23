import { createHead, UnheadProvider } from '@unhead/react/client';
import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { createBrowserRouter, type HydrationState, RouterProvider } from 'react-router';
import './index.css';
import { routes } from './routes';

const head = createHead();
const hydrationData = (
  window as Window & {
    __staticRouterHydrationData?: HydrationState;
  }
).__staticRouterHydrationData;
const router = createBrowserRouter(routes, { hydrationData });

hydrateRoot(
  document.getElementById('app')!,
  <StrictMode>
    <UnheadProvider head={head}>
      <RouterProvider router={router} />
    </UnheadProvider>
  </StrictMode>,
);
