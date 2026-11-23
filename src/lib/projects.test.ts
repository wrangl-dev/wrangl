import {
  addProject,
  loadProjects,
  nameFromPath,
  projectColor,
  removeProject,
  saveProjects,
} from './projects';

describe('projects', () => {
  it('names a project after its folder on any OS', () => {
    expect(nameFromPath('C:\\work\\storefront\\')).toBe('storefront');
    expect(nameFromPath('/home/me/payments-api')).toBe('payments-api');
    expect(nameFromPath('infra')).toBe('infra');
  });

  it('adds a folder once, ignoring case and trailing slashes', () => {
    const first = addProject([], 'C:\\work\\infra\\');
    expect(first.project).toMatchObject({ name: 'infra', path: 'C:\\work\\infra' });
    const again = addProject(first.list, 'c:\\work\\INFRA');
    expect(again.list).toHaveLength(1);
    expect(again.project.id).toBe(first.project.id);
  });

  it('refuses an empty path', () => {
    expect(() => addProject([], '   ')).toThrow('Enter a folder path');
  });

  it('removes by id', () => {
    const { list, project } = addProject([], '/a');
    expect(removeProject(list, project.id)).toEqual([]);
  });

  it('cycles badge colours', () => {
    expect(projectColor(0)).toBe(projectColor(6));
    expect(projectColor(0)).not.toBe(projectColor(1));
  });

  it('round-trips through storage and drops junk', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const { list } = addProject([], '/srv/docs-site');
    saveProjects(list, storage);
    expect(loadProjects(storage)).toEqual(list);

    store.set('wrangl.projects.v1', JSON.stringify([{ id: 1 }, ...list]));
    expect(loadProjects(storage)).toEqual(list);
    store.set('wrangl.projects.v1', '{not json');
    expect(loadProjects(storage)).toEqual([]);
  });
});
