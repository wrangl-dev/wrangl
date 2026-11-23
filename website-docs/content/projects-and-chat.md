---

title: Projects and chat
description: Open a folder as a project, start chats with an agent in it, approve what the agent wants to do, and use terminals.
---

# Projects and chat

Everything in Wrangl happens inside a project: a folder on your disk. Agents start in that folder and terminals open there.

## Add a project

Click **+** next to Projects in the sidebar and type the folder path, for example `C:\work\app` or `~/code/app`. The project appears in the sidebar with its chats under it. Removing a project from the sidebar does not touch the folder.

## Chat with an agent

Pick an agent in the chat box (see [Agents](/docs/agent-setup/install-agents)), type, and press **Enter**. **Shift+Enter** adds a new line.

While the agent works you see:

- its answer, streamed in as Markdown,
- its thinking, when the agent shares it,
- every tool call with its status (running, done, failed),
- its plan, when it makes one.

Press the stop button to end the turn. Each chat keeps running when you switch to another chat or project; a dot in the sidebar shows which ones are busy.

## Approvals

When an agent wants to run a command, edit a file or do anything else that needs your say, a card appears in the chat. Choose one of the options the agent offers, such as allow once or reject. The agent waits until you answer.

Wallet actions never use these cards. They wait for you in the [wallet](/docs/wallet) instead.

## Terminals

Press **Ctrl+`** (**Cmd+`** on macOS) to show or hide the terminal panel under the chat. Each project has its own terminal tabs, starting in the project folder: PowerShell on Windows, your login shell on macOS and Linux. Hidden terminals keep running.
