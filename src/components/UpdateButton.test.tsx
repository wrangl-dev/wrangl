import { act, fireEvent, render, screen } from '@testing-library/react';
import type { AvailableUpdate } from '../lib/updates';
import { UpdateButton } from './UpdateButton';

describe('UpdateButton', () => {
  it('stays hidden when there is no newer version', async () => {
    const check = vi.fn().mockResolvedValue(null);
    const { container } = render(<UpdateButton check={check} />);
    await act(async () => {});
    expect(check).toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the new version and shows progress while installing', async () => {
    let finish: () => void = () => {};
    const install = vi.fn((onProgress?: (d: number, t: number | null) => void) => {
      onProgress?.(50, 100);
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const update: AvailableUpdate = { version: '0.3.0', notes: null, install };
    render(<UpdateButton check={() => Promise.resolve(update)} />);

    const button = await screen.findByRole('button', { name: 'Update to 0.3.0' });
    fireEvent.click(button);
    expect(install).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Updating… 50%' })).toBeDisabled();
    await act(async () => finish());
  });

  it('lets the user retry after a failed install', async () => {
    const update: AvailableUpdate = {
      version: '0.3.0',
      notes: null,
      install: () => Promise.reject(new Error('signature mismatch')),
    };
    render(<UpdateButton check={() => Promise.resolve(update)} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Update to 0.3.0' }));
    const retry = await screen.findByRole('button', { name: 'Update failed, retry' });
    expect(retry).toHaveAttribute('title', 'signature mismatch');
    expect(retry).toBeEnabled();
  });
});
