// Every feature of the app, driven through the real UI and the real Rust backend. The agent is
// the scripted fake agent (fake-agent.ts); everything else is Wrangl's own code, including the
// MCP tool server the agent calls.
//
// Tests tagged @network reach Robinhood Chain and KyberSwap. Skip them offline with
// `bun run test:e2e --grep-invert @network`.

import { expect, type Page, test } from '@playwright/test';
import { AGENT_NAME } from './server';

const project = process.env.E2E_PROJECT ?? '';
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';

/** Opens the app with the test project added and the fake agent picked. */
async function openChat(page: Page) {
  await page.goto('/');
  const folder = page.getByRole('textbox', { name: 'Project folder' });
  // With no project yet, the folder box is already open.
  if (!(await folder.isVisible())) await page.getByRole('button', { name: 'Add project' }).click();
  await folder.fill(project);
  await folder.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Projects' })).toContainText('storefront');

  const trigger = page.locator('.agent-trigger');
  await trigger.click();
  await page.getByRole('option', { name: new RegExp(AGENT_NAME) }).click();
  await expect(trigger).toContainText(AGENT_NAME);
}

async function send(page: Page, text: string) {
  const box = page.getByRole('textbox', { name: 'Message' });
  await box.fill(text);
  await box.press('Enter');
}

const lastAnswer = (page: Page) => page.locator('.msg-agent').last();

test.describe('agents and chat', () => {
  test('the registry lists the agent and a chat answers in Markdown', async ({ page }) => {
    await openChat(page);
    await send(page, 'hello');
    await expect(page.locator('.msg-user').last()).toHaveText('hello');
    await expect(lastAnswer(page)).toContainText('pong:');
    await expect(lastAnswer(page).locator('strong')).toHaveText('hello');
    await expect(page.locator('.msg-working')).toHaveCount(0);
  });

  test('a permission request waits for the user and passes on the answer', async ({ page }) => {
    await openChat(page);
    await send(page, '/ask');
    const card = page.getByRole('group', { name: 'Permission request' });
    await expect(card).toContainText('rm -rf build');
    await card.getByRole('button', { name: 'Allow once' }).click();
    await expect(card).toHaveCount(0);
    await expect(lastAnswer(page)).toContainText('permission: allow-once');
  });

  test('rejecting a permission request is passed on too', async ({ page }) => {
    await openChat(page);
    await send(page, '/ask');
    await page
      .getByRole('group', { name: 'Permission request' })
      .getByRole('button', { name: 'Reject' })
      .click();
    await expect(lastAnswer(page)).toContainText('permission: reject-once');
  });

  test('the plan shows with its steps', async ({ page }) => {
    await openChat(page);
    await send(page, '/plan');
    const plan = page.getByRole('list', { name: 'Plan' });
    await expect(plan.getByRole('listitem')).toHaveCount(3);
    await expect(plan).toContainText('Quote the swap');
  });

  test('stop ends a running turn', async ({ page }) => {
    await openChat(page);
    await send(page, '/slow');
    await expect(lastAnswer(page)).toContainText('chunk 3');
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Stopped' })).toBeVisible();
    const text = await lastAnswer(page).textContent();
    await page.waitForTimeout(1000);
    expect(await lastAnswer(page).textContent()).toBe(text);
  });

  test('the chat is listed under its project and keeps running while another opens', async ({
    page,
  }) => {
    await openChat(page);
    await send(page, '/slow');
    const chats = page.getByRole('list', { name: 'Chats in storefront' });
    await expect(chats.getByRole('listitem')).toHaveCount(1);
    await expect(chats.getByLabel('working')).toBeVisible();

    // Row actions show on hover (or keyboard focus).
    await page.getByRole('button', { name: 'storefront', exact: true }).hover();
    await page.getByRole('button', { name: 'New chat in storefront' }).click();
    // A new chat joins the list once it has a message.
    await expect(page.locator('.agent-trigger, .agent-fixed').first()).toContainText(AGENT_NAME);
    await send(page, 'second chat');
    await expect(lastAnswer(page)).toContainText('pong:');
    await expect(chats.getByRole('listitem')).toHaveCount(2);

    // The first chat kept streaming in the background.
    await chats.getByRole('button', { name: /\/slow/ }).click();
    await expect(lastAnswer(page)).toContainText(/chunk (1[5-9]|[2-9][0-9]|1[0-9][0-9])/);
    await page.getByRole('button', { name: 'Stop' }).click();
  });
});

test.describe('files', () => {
  test('@ finds a project file and the agent gets it as a link', async ({ page }) => {
    await openChat(page);
    const box = page.getByRole('textbox', { name: 'Message' });
    await box.pressSequentially('summarize @READ');
    const menu = page.getByRole('listbox', { name: 'Files' });
    await expect(menu.getByRole('option').first()).toContainText('README.md');
    await box.press('Enter');
    await expect(box).toHaveValue('summarize @README.md ');
    await box.press('Enter');
    await expect(page.getByLabel('Attached files')).toContainText('README.md');
    await expect(lastAnswer(page)).toContainText('files: README.md');
  });
});

test.describe('file changes', () => {
  test('an edit shows its diff before it is allowed and stays under the tool call', async ({
    page,
  }) => {
    await openChat(page);
    await send(page, '/edit');
    const card = page.getByRole('group', { name: 'Permission request' });
    const before = card.getByLabel('File changes');
    await expect(before).toContainText('README.md');
    await expect(before).toContainText('+2');
    await expect(before.locator('tr[data-kind="add"]').last()).toContainText(
      'Sells tokenized goods.',
    );
    await card.getByRole('button', { name: 'Allow once' }).click();

    await expect(lastAnswer(page)).toContainText('README updated');
    const after = page.locator('.thread > .diffs').last();
    await expect(after).toContainText('README.md');
    await after.locator('summary').click();
    await expect(after.locator('tr[data-kind="add"]').last()).toContainText(
      'Sells tokenized goods.',
    );
  });
});

test.describe('saved chats', () => {
  test('a chat comes back after a reload and continues the agent session', async ({ page }) => {
    await openChat(page);
    const word = `kept-${Date.now()}`;
    await send(page, word);
    await expect(lastAnswer(page)).toContainText(word);
    // Saves settle shortly after the answer.
    await page.waitForTimeout(800);

    await page.reload();
    const chats = page.getByRole('list', { name: 'Chats in storefront' });
    await chats.getByRole('button', { name: word }).click();
    await expect(page.locator('.msg-user').first()).toHaveText(word);
    await expect(lastAnswer(page)).toContainText(word);

    await send(page, 'after reload');
    await expect(lastAnswer(page)).toContainText('after reload');
    // The agent's replay of the loaded session is not shown twice, and it was resumed.
    await expect(page.getByText('replayed earlier answer')).toHaveCount(0);
    await expect(page.getByText('does not remember')).toHaveCount(0);
  });

  test('a deleted chat stays deleted after a reload', async ({ page }) => {
    await openChat(page);
    const word = `gone-${Date.now()}`;
    await send(page, word);
    await expect(lastAnswer(page)).toContainText(word);
    const chats = page.getByRole('list', { name: 'Chats in storefront' });
    const row = chats.getByRole('listitem').filter({ hasText: word });
    await row.hover();
    await row.getByRole('button', { name: `Close chat ${word}` }).click();
    await expect(row).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('complementary', { name: 'Projects' })).toContainText('storefront');
    await expect(chats.getByRole('listitem').filter({ hasText: word })).toHaveCount(0);
  });
});

test.describe('terminals', () => {
  test('Ctrl+` opens a terminal in the project', async ({ page }) => {
    await openChat(page);
    await page.keyboard.press('Control+Backquote');
    const terminals = page.getByRole('region', { name: 'Terminal' });
    await expect(terminals).toBeVisible();
    await expect(terminals.locator('.xterm')).toBeVisible();
    // Wait for the shell's prompt, so no keystroke is lost while it starts.
    await expect(terminals.locator('.xterm-rows')).toContainText(/[>$%#]\s*$/, { timeout: 15_000 });
    await page.keyboard.type('echo wrangl-e2e-$((40+2))');
    await page.keyboard.press('Enter');
    await expect(terminals.locator('.xterm-rows')).toContainText(/wrangl-e2e-42|wrangl-e2e-\$/);
    await page.getByRole('button', { name: 'Hide terminal' }).click();
    await expect(terminals).toBeHidden();
  });
});

test.describe('wallet and settings', () => {
  test('the wallet tool reports that no wallet is connected', async ({ page }) => {
    await openChat(page);
    await send(page, '/tool wallet_address {}');
    await expect(page.locator('.msg-tool').last()).toContainText('wrangl: wallet_address');
    await expect(lastAnswer(page)).toContainText('"connected": false');
  });

  test('the Wallet page offers to connect', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Wallet', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No wallet connected' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect wallet' })).toBeVisible();
  });

  test('Settings saves an RPC and shows only its host', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('Using the public RPC')).toBeVisible();
    await page
      .getByRole('textbox', { name: 'RPC URL' })
      .fill('https://rpc.example.test/v2/SECRET-KEY');
    await page.getByRole('button', { name: 'Save' }).first().click();
    await expect(page.getByText('rpc.example.test')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('SECRET-KEY');
    await page.getByRole('button', { name: 'Remove my RPC' }).click();
    await expect(page.getByText('Using the public RPC')).toBeVisible();
  });
});

test.describe('portfolio', () => {
  test('without a wallet the Portfolio page offers to connect one', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Portfolio', exact: true }).click();
    const portfolio = page.getByRole('region', { name: 'Portfolio' });
    await expect(portfolio.getByRole('heading', { name: 'No wallet connected' })).toBeVisible();
    await portfolio.getByRole('button', { name: 'Open Wallet' }).click();
    await expect(page.getByRole('button', { name: 'Connect wallet' })).toBeVisible();
  });
});

test.describe('Robinhood Chain @network', () => {
  // GeckoTerminal rate-limits busy IPs (CI runners included); the tools wait out a 429 for
  // 5–15 s per request, so these tests get room for that.
  test.describe.configure({ timeout: 180_000 });

  test('the watchlist reads a token, keeps its alert, and lets it go', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Portfolio', exact: true }).click();
    const portfolio = page.getByRole('region', { name: 'Portfolio' });
    await portfolio.getByRole('textbox', { name: 'Token address' }).fill(USDG);
    await portfolio.getByRole('button', { name: 'Watch' }).click();
    const table = portfolio.getByRole('table', { name: 'Watched tokens' });
    await expect(table).toContainText('USDG', { timeout: 40_000 });
    await expect(table).toContainText('$', { timeout: 40_000 });

    await portfolio.getByLabel('Alert USDG above').fill('5');
    await table.getByRole('button', { name: 'Save' }).click();
    await expect(table.getByRole('button', { name: 'Save' })).toHaveCount(0);

    await page.reload();
    await page.getByRole('button', { name: 'Portfolio', exact: true }).click();
    await expect(page.getByLabel('Alert USDG above')).toHaveValue('5', { timeout: 40_000 });
    await page.getByRole('button', { name: 'Stop watching USDG' }).click();
    await expect(page.getByRole('table', { name: 'Watched tokens' })).toHaveCount(0);
  });

  test('chain_status reads the chain through the tool server', async ({ page }) => {
    await openChat(page);
    await send(page, '/tool chain_status {}');
    await expect(page.locator('.msg-tool').last()).toHaveAttribute('data-status', 'completed', {
      timeout: 40_000,
    });
    await expect(lastAnswer(page)).toContainText('4663');
  });

  test('chain_token checks USDG', async ({ page }) => {
    await openChat(page);
    await send(page, `/tool chain_token {"address":"${USDG}"}`);
    await expect(lastAnswer(page)).toContainText(/USDG|Global Dollar/i, { timeout: 40_000 });
  });

  test('swap_quote prices a swap through KyberSwap', async ({ page }) => {
    await openChat(page);
    await send(page, `/tool swap_quote {"token_in":"${USDG}","token_out":"ETH","amount":"25"}`);
    await expect(lastAnswer(page)).toContainText(/ETH/, { timeout: 40_000 });
    await expect(page.locator('.msg-tool').last()).toHaveAttribute('data-status', 'completed');
  });

  test('research tools answer through the tool server', async ({ page }) => {
    await openChat(page);
    await send(page, '/tool launches {"launchpad":"pons-v2"}');
    await expect(page.locator('.msg-tool').last()).toHaveAttribute('data-status', 'completed', {
      timeout: 150_000,
    });
    await expect(lastAnswer(page)).toContainText('pons-v2');
    await send(page, `/tool token_profile {"token":"${USDG}"}`);
    await expect(lastAnswer(page)).toContainText(/holders/, { timeout: 150_000 });
  });

  test('Research on a watched token opens a chat with the request', async ({ page }) => {
    await openChat(page);
    await page.getByRole('button', { name: 'Portfolio', exact: true }).click();
    const portfolio = page.getByRole('region', { name: 'Portfolio' });
    await portfolio.getByRole('textbox', { name: 'Token address' }).fill(USDG);
    await portfolio.getByRole('button', { name: 'Watch' }).click();
    await portfolio.getByRole('button', { name: 'Research USDG' }).click({ timeout: 150_000 });
    const box = page.getByRole('textbox', { name: 'Message' });
    await expect(box).toHaveValue(/Research USDG \(0x5fc5/);
    await expect(box).toHaveValue(/token_report/);
    await page.getByRole('button', { name: 'Portfolio', exact: true }).click();
    await page.getByRole('button', { name: 'Stop watching USDG' }).click();
  });

  test('Settings tests the public RPC', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Test' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Connected|chain 4663/ })).toBeVisible({
      timeout: 30_000,
    });
  });
});
