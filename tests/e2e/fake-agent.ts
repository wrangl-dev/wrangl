#!/usr/bin/env bun
// A scripted ACP agent for the end-to-end tests: no LLM, no network of its own, no sign-in.
// It speaks ACP (JSON-RPC, one message per line) on stdin/stdout. What it does depends on the
// prompt text:
//
//   /tool <name> <json args>  calls that tool on Wrangl's MCP server (the one Wrangl passes in
//                             session/new), shows it as a tool call, and replies with the result
//   /ask                      asks the user for permission, replies with the option they chose
//   /plan                     sends a three-step plan
//   /edit                     asks to edit README.md, showing the diff, then reports the edit
//   /slow                     streams a chunk every 200ms until the turn is cancelled
//   anything else             replies "pong: <text>" in two chunks, with Markdown, and lists
//                             the files mentioned with @ (resource links) as "files: a, b"
//
// It supports session/load: a loaded session replays "replayed earlier answer" (Wrangl already
// shows the saved messages, so the replay must not appear twice) and then works as usual.
//
// Every reply ends the turn with stopReason end_turn (or cancelled).

import { type ChildProcess, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Message = {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
};
type McpServer = {
  name: string;
  command: string;
  args?: string[];
  env?: { name: string; value: string }[];
};

const write = (message: object) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
const respond = (id: Message['id'], result: Json) => write({ id, result });
const notify = (method: string, params: object) => write({ method, params });

let nextRequestId = 1;
const waiting = new Map<number, (result: any) => void>();
/** Sends a request to the client (Wrangl) and waits for its answer. */
function ask(method: string, params: object): Promise<any> {
  const id = nextRequestId++;
  write({ id, method, params });
  return new Promise((resolve) => waiting.set(id, resolve));
}

const sessions = new Map<string, { mcp: McpServer[]; cancelled: boolean }>();
let sessionCount = 0;

const update = (sessionId: string, u: object) => notify('session/update', { sessionId, update: u });
const say = (sessionId: string, text: string) =>
  update(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function prompt(sessionId: string, text: string, links: string[] = []): Promise<string> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`unknown session ${sessionId}`);
  session.cancelled = false;

  if (text.startsWith('/tool ')) {
    const rest = text.slice(6).trim();
    const space = rest.indexOf(' ');
    const name = space < 0 ? rest : rest.slice(0, space);
    const args = space < 0 ? {} : JSON.parse(rest.slice(space + 1));
    const toolCallId = `tool-${Date.now()}`;
    update(sessionId, {
      sessionUpdate: 'tool_call',
      toolCallId,
      title: `wrangl: ${name}`,
      kind: 'fetch',
      status: 'in_progress',
    });
    const server = session.mcp.find((s) => s.name === 'wrangl');
    if (!server) {
      update(sessionId, { sessionUpdate: 'tool_call_update', toolCallId, status: 'failed' });
      say(sessionId, 'no wrangl MCP server was offered');
      return 'end_turn';
    }
    const { text: out, isError } = await callMcpTool(server, name, args);
    update(sessionId, {
      sessionUpdate: 'tool_call_update',
      toolCallId,
      status: isError ? 'failed' : 'completed',
    });
    say(sessionId, `${name} → ${out.slice(0, 600)}`);
    return 'end_turn';
  }

  if (text === '/ask') {
    const result = await ask('session/request_permission', {
      sessionId,
      toolCall: {
        toolCallId: `ask-${Date.now()}`,
        title: 'Run `rm -rf build`',
        kind: 'execute',
        status: 'pending',
      },
      options: [
        { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
      ],
    });
    const outcome = result?.outcome;
    say(
      sessionId,
      `permission: ${outcome?.outcome === 'selected' ? outcome.optionId : 'cancelled'}`,
    );
    return 'end_turn';
  }

  if (text === '/edit') {
    const diff = {
      type: 'diff',
      path: 'README.md',
      oldText: '# storefront\n',
      newText: '# storefront\n\nSells tokenized goods.\n',
    };
    const toolCallId = `edit-${Date.now()}`;
    const result = await ask('session/request_permission', {
      sessionId,
      toolCall: {
        toolCallId,
        title: 'Edit README.md',
        kind: 'edit',
        status: 'pending',
        content: [diff],
      },
      options: [
        { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
      ],
    });
    if (result?.outcome?.optionId !== 'allow-once') {
      say(sessionId, 'edit skipped');
      return 'end_turn';
    }
    update(sessionId, {
      sessionUpdate: 'tool_call',
      toolCallId,
      title: 'Edit README.md',
      kind: 'edit',
      status: 'in_progress',
      content: [diff],
    });
    update(sessionId, { sessionUpdate: 'tool_call_update', toolCallId, status: 'completed' });
    say(sessionId, 'README updated');
    return 'end_turn';
  }

  if (text === '/plan') {
    update(sessionId, {
      sessionUpdate: 'plan',
      entries: [
        { content: 'Read the token contract', priority: 'high', status: 'completed' },
        { content: 'Quote the swap', priority: 'medium', status: 'in_progress' },
        { content: 'Ask the user to sign', priority: 'low', status: 'pending' },
      ],
    });
    say(sessionId, 'plan sent');
    return 'end_turn';
  }

  if (text === '/slow') {
    for (let i = 1; i <= 150; i++) {
      if (session.cancelled) return 'cancelled';
      say(sessionId, `chunk ${i} `);
      await sleep(200);
    }
    return 'end_turn';
  }

  if (links.length)
    say(
      sessionId,
      `files: ${links.join(', ')}

`,
    );
  say(sessionId, 'pong: ');
  await sleep(50);
  say(sessionId, `**${text}**`);
  return 'end_turn';
}

/** Starts Wrangl's MCP server, calls one tool, stops the server. */
async function callMcpTool(
  server: McpServer,
  name: string,
  args: object,
): Promise<{ text: string; isError: boolean }> {
  const env = {
    ...process.env,
    ...Object.fromEntries((server.env ?? []).map((e) => [e.name, e.value])),
  };
  const child: ChildProcess = spawn(server.command, server.args ?? [], {
    env,
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const pending = new Map<number, (m: Message) => void>();
  createInterface({ input: child.stdout! }).on('line', (line) => {
    try {
      const m = JSON.parse(line) as Message;
      if (typeof m.id === 'number') pending.get(m.id)?.(m);
    } catch {
      // not a JSON-RPC line
    }
  });
  let id = 0;
  const request = (method: string, params: object) =>
    new Promise<Message>((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id: n, method, params })}\n`);
    });
  try {
    await request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'wrangl-e2e-agent', version: '1.0.0' },
    });
    child.stdin!.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
    );
    const reply = await request('tools/call', { name, arguments: args });
    if (reply.error) return { text: `error: ${reply.error.message}`, isError: true };
    const text = (reply.result?.content ?? [])
      .map((c: { text?: string }) => c.text ?? '')
      .join('\n');
    return { text, isError: Boolean(reply.result?.isError) };
  } finally {
    child.kill();
  }
}

createInterface({ input: process.stdin }).on('line', async (line) => {
  let m: Message;
  try {
    m = JSON.parse(line);
  } catch {
    return;
  }
  // An answer to one of our requests.
  if (m.method === undefined && typeof m.id === 'number' && waiting.has(m.id)) {
    waiting.get(m.id)?.(m.result);
    waiting.delete(m.id);
    return;
  }
  try {
    switch (m.method) {
      case 'initialize':
        respond(m.id, {
          protocolVersion: 1,
          agentCapabilities: { loadSession: true, promptCapabilities: {} },
          authMethods: [],
          agentInfo: { name: 'wrangl-e2e-agent', version: '1.0.0' },
        });
        break;
      case 'session/new': {
        const sessionId = `e2e-${++sessionCount}`;
        sessions.set(sessionId, { mcp: m.params?.mcpServers ?? [], cancelled: false });
        respond(m.id, { sessionId });
        break;
      }
      case 'session/load': {
        const sessionId = String(m.params?.sessionId);
        sessions.set(sessionId, { mcp: m.params?.mcpServers ?? [], cancelled: false });
        say(sessionId, 'replayed earlier answer');
        respond(m.id, {});
        break;
      }
      case 'session/prompt': {
        const blocks: { type: string; text?: string; name?: string; uri?: string }[] =
          m.params?.prompt ?? [];
        const text = blocks
          .map((b) => b.text ?? '')
          .join('')
          .trim();
        const links = blocks
          .filter((b) => b.type === 'resource_link' && String(b.uri).startsWith('file:///'))
          .map((b) => String(b.name));
        const stopReason = await prompt(m.params.sessionId, text, links);
        respond(m.id, { stopReason });
        break;
      }
      case 'session/cancel': {
        const session = sessions.get(m.params?.sessionId);
        if (session) session.cancelled = true;
        break;
      }
      default:
        if (m.id !== undefined)
          write({ id: m.id, error: { code: -32601, message: `no method ${m.method}` } });
    }
  } catch (e) {
    if (m.id !== undefined) write({ id: m.id, error: { code: -32603, message: String(e) } });
  }
});
