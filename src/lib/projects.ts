/** A folder the user works in. Terminals and (later) agents start there. */
export interface Project {
  id: string;
  name: string;
  path: string;
}

const KEY = 'wrangl.projects.v1';

/** Badge colours, picked by position so a project keeps its colour. */
export const PROJECT_COLORS = ['#5b8cff', '#3ecf8e', '#ff8a3d', '#a66bff', '#ff5c8a', '#2ec5d3'];

export const projectColor = (index: number): string =>
  PROJECT_COLORS[index % PROJECT_COLORS.length];

/** The folder's last segment, for `C:\work\storefront\` or `/home/me/storefront`. */
export function nameFromPath(path: string): string {
  const parts = path
    .trim()
    .split(/[\\/]+/)
    .filter(Boolean);
  return parts.at(-1) ?? path.trim();
}

const normalise = (path: string) => path.trim().replace(/[\\/]+$/, '');

/** Add a project unless that folder is already listed. Returns the new list and the project. */
export function addProject(
  list: Project[],
  rawPath: string,
): { list: Project[]; project: Project } {
  const path = normalise(rawPath);
  if (!path) throw new Error('Enter a folder path');
  const existing = list.find((p) => normalise(p.path).toLowerCase() === path.toLowerCase());
  if (existing) return { list, project: existing };
  const project: Project = { id: crypto.randomUUID(), name: nameFromPath(path), path };
  return { list: [...list, project], project };
}

export const removeProject = (list: Project[], id: string): Project[] =>
  list.filter((p) => p.id !== id);

function isProject(value: unknown): value is Project {
  const p = value as Project;
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.path === 'string'
  );
}

/** Saved projects; an empty list when nothing (valid) is stored. */
export function loadProjects(storage: Pick<Storage, 'getItem'> = localStorage): Project[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isProject) : [];
  } catch {
    return [];
  }
}

export function saveProjects(
  list: Project[],
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    storage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage can be full or blocked; the list still works for this session.
  }
}
