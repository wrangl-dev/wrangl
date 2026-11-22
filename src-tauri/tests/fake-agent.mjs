// A tiny ACP agent for tests: newline-delimited JSON-RPC on stdin/stdout.
// - session/prompt streams "hello", asks permission to "Run ls", reports the choice, ends the turn.
// - With FAKE_AUTH=1, session/new fails with auth_required until `authenticate` is called.
// - With FAKE_AUTH=prompt, the session opens but prompts fail with auth_required until signed in.
// - A prompt of "wait" never ends until cancelled.
import { createInterface } from 'node:readline';

const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
const update = (sessionId, text) =>
  send({
    method: 'session/update',
    params: {
      sessionId,
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
    },
  });

let authed = process.env.FAKE_AUTH !== '1';
let promptAuthed = process.env.FAKE_AUTH !== 'prompt';
let nextId = 1000;
const waiting = new Map();
let pendingPrompt = null;

createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);

  if (msg.method === undefined && waiting.has(msg.id)) {
    waiting.get(msg.id)(msg.result);
    waiting.delete(msg.id);
    return;
  }

  switch (msg.method) {
    case 'initialize':
      send({
        id: msg.id,
        result: {
          protocolVersion: 1,
          agentCapabilities: {},
          authMethods: [{ id: 'fake-login', name: 'Fake login', description: 'For tests' }],
        },
      });
      break;
    case 'authenticate':
      authed = true;
      promptAuthed = true;
      send({ id: msg.id, result: {} });
      break;
    case 'session/new':
      if (!authed)
        send({ id: msg.id, error: { code: -32000, message: 'Authentication required' } });
      else send({ id: msg.id, result: { sessionId: 's1' } });
      break;
    case 'session/cancel':
      if (pendingPrompt) {
        send({ id: pendingPrompt, result: { stopReason: 'cancelled' } });
        pendingPrompt = null;
      }
      break;
    case 'session/prompt': {
      const { sessionId, prompt } = msg.params;
      if (!promptAuthed) {
        send({ id: msg.id, error: { code: -32000, message: 'Authentication required' } });
        break;
      }
      const text = prompt.map((b) => b.text ?? '').join('');
      if (text === 'wait') {
        pendingPrompt = msg.id;
        update(sessionId, 'waiting');
        break;
      }
      update(sessionId, 'hello');
      const askId = nextId++;
      waiting.set(askId, (result) => {
        const outcome =
          result.outcome.outcome === 'selected' ? result.outcome.optionId : 'cancelled';
        update(sessionId, `chose ${outcome}`);
        send({ id: msg.id, result: { stopReason: 'end_turn' } });
      });
      send({
        id: askId,
        method: 'session/request_permission',
        params: {
          sessionId,
          toolCall: { toolCallId: 't1', title: 'Run ls' },
          options: [
            { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
            { optionId: 'deny', name: 'Deny', kind: 'reject_once' },
          ],
        },
      });
      break;
    }
    default:
      if (msg.id !== undefined) send({ id: msg.id, error: { code: -32601, message: 'not found' } });
  }
});
