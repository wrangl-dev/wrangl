import { startServer } from './server';

/** Starts the shared server. Workers inherit E2E_PROJECT, the test project's folder. */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const server = await startServer();
  process.env.E2E_PROJECT = server.project;
  return server.stop;
}
