import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  answerPermission,
  authenticate,
  cancelTurn,
  chatReducer,
  initialChat,
  sendPrompt,
  startChat,
  startLogin,
  stopChat,
} from './chat';
import type { PtyEvent, SpawnOptions } from './pty';

/**
 * One chat with `agentId` in `cwd`. The agent starts on the first message and stops when the
 * agent, the folder or the component changes.
 */
export function useChat(agentId: string | null, cwd: string | null) {
  const [state, dispatch] = useReducer(chatReducer, initialChat);
  const session = useRef<Promise<string> | null>(null);

  const stop = useCallback(() => {
    const current = session.current;
    session.current = null;
    current?.then((id) => stopChat(id)).catch(() => {});
  }, []);

  // A different agent or folder is a different chat.
  useEffect(() => {
    dispatch({ kind: 'reset' });
    return stop;
  }, [agentId, cwd, stop]);

  const ensureSession = useCallback(() => {
    if (!agentId || !cwd) throw new Error('Pick an agent and a project first');
    if (!session.current) {
      const started = startChat(agentId, cwd, dispatch);
      started.catch((e: unknown) => {
        session.current = null;
        dispatch({ kind: 'exit', message: e instanceof Error ? e.message : String(e) });
      });
      session.current = started;
    }
    return session.current;
  }, [agentId, cwd]);

  const send = useCallback(
    async (text: string) => {
      dispatch({ kind: 'sent', text });
      try {
        const id = await ensureSession();
        await sendPrompt(id, text);
      } catch (e) {
        dispatch({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    },
    [ensureSession],
  );

  const withSession = useCallback(async (fn: (id: string) => Promise<void>) => {
    const id = await session.current;
    if (!id) return;
    try {
      await fn(id);
    } catch (e) {
      dispatch({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  return {
    state,
    send,
    cancel: () => withSession(cancelTurn),
    answer: (requestId: string, optionId: string | null) =>
      withSession((id) => answerPermission(id, requestId, optionId)),
    signIn: (methodId: string) => withSession((id) => authenticate(id, methodId)),
    /** Spawner for a terminal running the agent's `methodId` sign-in screen. */
    loginSpawner:
      (methodId: string) =>
      async (options: SpawnOptions, onEvent: (event: PtyEvent) => void): Promise<string> => {
        const id = await session.current;
        if (!id) throw new Error('the agent is not running');
        return startLogin(id, methodId, options, onEvent);
      },
    reset: () => {
      stop();
      dispatch({ kind: 'reset' });
    },
  };
}
