//! Chat sessions with ACP agents: start the agent process, open a session in the project folder,
//! send prompts, stream what the agent does, and ask the user before it acts.

use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::Arc;

use agent_client_protocol::schema::v1::{
    AuthCapabilities, AuthenticateRequest, CancelNotification, ClientCapabilities, ContentBlock,
    EnvVariable, ErrorCode, InitializeRequest, McpServer, McpServerStdio, NewSessionRequest,
    PromptRequest, RequestPermissionOutcome, RequestPermissionRequest, RequestPermissionResponse,
    SelectedPermissionOutcome, SessionId, SessionNotification, TextContent,
};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::{AcpAgent, Agent, Client, ConnectionTo, LineDirection};
use parking_lot::Mutex;
use serde::Serialize;
use serde_json::Value;
use tokio::sync::{mpsc, oneshot};

use super::install::CommandLine;

/// What a chat session tells the UI. Kinds and field names are camelCase, as the UI reads them.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AgentEvent {
    /// Progress before the session is usable: `installing`, `starting`, `ready`.
    Status { state: String },
    /// The agent wants the user to sign in first. `methods` are ACP auth methods.
    AuthRequired { methods: Value, message: String },
    /// An ACP `session/update`: message chunks, tool calls, plans. Passed through as JSON.
    Update { update: Value },
    /// The agent asks before acting. Answer with `respond_permission`.
    Permission {
        request_id: String,
        tool_call: Value,
        options: Value,
    },
    /// A prompt finished. `stop_reason` is ACP's (`end_turn`, `cancelled`, ...).
    TurnEnd { stop_reason: Value },
    /// Something failed; the session may still be usable.
    Error { message: String },
    /// The agent process is gone.
    Exit { message: Option<String> },
}

/// Delivers events for one session.
pub type EventFn = Arc<dyn Fn(AgentEvent) + Send + Sync>;

enum Command {
    Prompt(String),
    Cancel,
    Authenticate(String),
    Stop,
}

struct Handle {
    commands: mpsc::UnboundedSender<Command>,
    permissions: Arc<Mutex<HashMap<String, oneshot::Sender<Option<String>>>>>,
    /// How the agent was started, for its terminal sign-in.
    line: CommandLine,
    /// The sign-in methods from `initialize`.
    auth_methods: Arc<Mutex<Value>>,
}

/// All running chat sessions, keyed by Wrangl's own session id.
#[derive(Default, Clone)]
pub struct AgentSessions {
    sessions: Arc<Mutex<HashMap<String, Handle>>>,
}

const STDERR_LINES: usize = 20;

fn to_json<T: Serialize>(value: &T) -> Value {
    serde_json::to_value(value).unwrap_or(Value::Null)
}

fn acp_agent(line: &CommandLine, stderr: Arc<Mutex<VecDeque<String>>>) -> AcpAgent {
    let name = line
        .program
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("agent")
        .to_string();
    let env = line
        .env
        .iter()
        .map(|(k, v)| EnvVariable::new(k.clone(), v.clone()))
        .collect();
    let server = McpServer::Stdio(
        McpServerStdio::new(name, line.program.clone())
            .args(line.args.clone())
            .env(env),
    );
    AcpAgent::new(server).with_debug(move |text, direction| {
        if matches!(direction, LineDirection::Stderr) {
            let mut lines = stderr.lock();
            if lines.len() == STDERR_LINES {
                lines.pop_front();
            }
            lines.push_back(text.trim_end().to_string());
        }
    })
}

impl AgentSessions {
    /// Start `line` as an ACP agent with a session in `cwd`. `tool_env` goes to Wrangl's tool
    /// server for this chat (RPC settings, the wallet link). Returns the session id at once;
    /// progress arrives as events.
    pub fn start(
        &self,
        line: CommandLine,
        cwd: PathBuf,
        tool_env: Vec<(String, String)>,
        emit: EventFn,
    ) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let mut tool_env = tool_env;
        tool_env.push((crate::chain::mcp::CHAT_ID_ENV.to_string(), id.clone()));
        let tools = wrangl_tools(tool_env);
        let (tx, rx) = mpsc::unbounded_channel();
        let permissions = Arc::new(Mutex::new(HashMap::new()));
        let auth_methods = Arc::new(Mutex::new(Value::Null));
        self.sessions.lock().insert(
            id.clone(),
            Handle {
                commands: tx,
                permissions: Arc::clone(&permissions),
                line: line.clone(),
                auth_methods: Arc::clone(&auth_methods),
            },
        );

        let sessions = Arc::clone(&self.sessions);
        let session_key = id.clone();
        tokio::spawn(async move {
            let stderr = Arc::new(Mutex::new(VecDeque::new()));
            let agent = acp_agent(&line, Arc::clone(&stderr));
            log::info!(
                "[agents] {session_key}: starting {}",
                line.program.display()
            );
            emit(AgentEvent::Status {
                state: "starting".into(),
            });
            let result = run(
                agent,
                cwd,
                tools,
                rx,
                permissions,
                auth_methods,
                Arc::clone(&emit),
            )
            .await;
            sessions.lock().remove(&session_key);
            let message = result.err().map(|e| {
                let tail: Vec<String> = stderr.lock().iter().cloned().collect();
                if tail.is_empty() {
                    e
                } else {
                    format!("{e}\n{}", tail.join("\n"))
                }
            });
            log::info!("[agents] {session_key}: ended {message:?}");
            emit(AgentEvent::Exit { message });
        });
        id
    }

    fn send(&self, id: &str, command: Command) -> Result<(), String> {
        let sessions = self.sessions.lock();
        let handle = sessions
            .get(id)
            .ok_or_else(|| format!("no chat session {id}"))?;
        handle
            .commands
            .send(command)
            .map_err(|_| "the agent has stopped".to_string())
    }

    pub fn prompt(&self, id: &str, text: String) -> Result<(), String> {
        if text.trim().is_empty() {
            return Err("the message is empty".into());
        }
        self.send(id, Command::Prompt(text))
    }

    pub fn cancel(&self, id: &str) -> Result<(), String> {
        self.send(id, Command::Cancel)
    }

    pub fn authenticate(&self, id: &str, method_id: String) -> Result<(), String> {
        self.send(id, Command::Authenticate(method_id))
    }

    /// Answer a permission request: an option id, or `None` to refuse.
    pub fn respond_permission(
        &self,
        id: &str,
        request_id: &str,
        option_id: Option<String>,
    ) -> Result<(), String> {
        let sessions = self.sessions.lock();
        let handle = sessions
            .get(id)
            .ok_or_else(|| format!("no chat session {id}"))?;
        let waiting = handle
            .permissions
            .lock()
            .remove(request_id)
            .ok_or_else(|| format!("no open permission request {request_id}"))?;
        let _ = waiting.send(option_id);
        Ok(())
    }

    /// The command line for a `terminal` sign-in method: the agent's own program with the
    /// method's extra arguments and environment.
    pub fn login_command(&self, id: &str, method_id: &str) -> Result<CommandLine, String> {
        let sessions = self.sessions.lock();
        let handle = sessions
            .get(id)
            .ok_or_else(|| format!("no chat session {id}"))?;
        let methods = handle.auth_methods.lock().clone();
        terminal_login(&handle.line, &methods, method_id)
    }

    /// Stop a session's agent. Unknown ids are ignored.
    pub fn stop(&self, id: &str) {
        let _ = self.send(id, Command::Stop);
    }

    pub fn stop_all(&self) {
        let ids: Vec<String> = self.sessions.lock().keys().cloned().collect();
        for id in ids {
            self.stop(&id);
        }
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.sessions.lock().len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Build the sign-in command for `method_id` from ACP `authMethods` JSON.
pub fn terminal_login(
    line: &CommandLine,
    methods: &Value,
    method_id: &str,
) -> Result<CommandLine, String> {
    let method = methods
        .as_array()
        .and_then(|list| list.iter().find(|m| m["id"] == method_id))
        .ok_or_else(|| format!("the agent has no sign-in method {method_id}"))?;
    if method["type"] != "terminal" {
        return Err(format!("{method_id} is not a terminal sign-in"));
    }
    let mut login = line.clone();
    if let Some(args) = method["args"].as_array() {
        login
            .args
            .extend(args.iter().filter_map(|a| a.as_str().map(str::to_string)));
    }
    if let Some(env) = method["env"].as_object() {
        for (k, v) in env {
            if let Some(v) = v.as_str() {
                login.env.insert(k.clone(), v.to_string());
            }
        }
    }
    Ok(login)
}

/// Wrangl's own MCP server (chain and wallet tools), offered to every session: this executable
/// with `--mcp`. Empty when the executable cannot be found, so a chat still works without it.
/// Only `env` reaches it from Wrangl.
fn wrangl_tools(env: Vec<(String, String)>) -> Vec<McpServer> {
    let Ok(exe) = std::env::current_exe() else {
        return vec![];
    };
    let env = env
        .into_iter()
        .map(|(name, value)| EnvVariable::new(name, value))
        .collect();
    vec![McpServer::Stdio(
        McpServerStdio::new(crate::chain::mcp::SERVER_NAME, exe)
            .args(vec![crate::chain::mcp::MCP_FLAG.to_string()])
            .env(env),
    )]
}

fn is_auth_required(error: &agent_client_protocol::Error) -> bool {
    error.code == ErrorCode::AuthRequired
}

#[allow(clippy::too_many_arguments)]
async fn run(
    agent: AcpAgent,
    cwd: PathBuf,
    tools: Vec<McpServer>,
    mut commands: mpsc::UnboundedReceiver<Command>,
    permissions: Arc<Mutex<HashMap<String, oneshot::Sender<Option<String>>>>>,
    known_auth: Arc<Mutex<Value>>,
    emit: EventFn,
) -> Result<(), String> {
    let on_update = Arc::clone(&emit);
    let on_permission = Arc::clone(&emit);
    let main = Arc::clone(&emit);

    Client
        .builder()
        .name("wrangl")
        .on_receive_notification(
            async move |notification: SessionNotification, _cx| {
                on_update(AgentEvent::Update {
                    update: to_json(&notification.update),
                });
                Ok(())
            },
            agent_client_protocol::on_receive_notification!(),
        )
        .on_receive_request(
            async move |request: RequestPermissionRequest,
                        responder,
                        cx: ConnectionTo<Agent>| {
                let request_id = uuid::Uuid::new_v4().to_string();
                let (tx, rx) = oneshot::channel();
                permissions.lock().insert(request_id.clone(), tx);
                on_permission(AgentEvent::Permission {
                    request_id,
                    tool_call: to_json(&request.tool_call),
                    options: to_json(&request.options),
                });
                // Wait for the user off the dispatch loop, so updates keep flowing.
                cx.spawn(async move {
                    let outcome = match rx.await {
                        Ok(Some(option)) => RequestPermissionOutcome::Selected(
                            SelectedPermissionOutcome::new(option),
                        ),
                        _ => RequestPermissionOutcome::Cancelled,
                    };
                    responder.respond(RequestPermissionResponse::new(outcome))
                })?;
                Ok(())
            },
            agent_client_protocol::on_receive_request!(),
        )
        .connect_with(agent, async move |cx: ConnectionTo<Agent>| {
            let init = cx
                .send_request(
                    InitializeRequest::new(ProtocolVersion::V1).client_capabilities(
                        // Wrangl can run an agent's own sign-in screen in a terminal.
                        ClientCapabilities::new().auth(AuthCapabilities::new().terminal(true)),
                    ),
                )
                .block_task()
                .await?;
            let auth_methods = to_json(&init.auth_methods);
            log::info!("[agents] initialized; sign-in methods: {auth_methods}");
            *known_auth.lock() = auth_methods.clone();

            // Open the session; when the agent wants a sign-in, wait for the user's choice.
            let session_id: SessionId = loop {
                match cx
                    .send_request(NewSessionRequest::new(cwd.clone()).mcp_servers(tools.clone()))
                    .block_task()
                    .await
                {
                    Ok(created) => break created.session_id,
                    Err(e) if is_auth_required(&e) => {
                        main(AgentEvent::AuthRequired {
                            methods: auth_methods.clone(),
                            message: e.message.clone(),
                        });
                        match commands.recv().await {
                            Some(Command::Authenticate(method)) => {
                                if let Err(e) = cx
                                    .send_request(AuthenticateRequest::new(method))
                                    .block_task()
                                    .await
                                {
                                    main(AgentEvent::Error { message: e.message });
                                }
                            }
                            Some(Command::Stop) | None => return Ok(()),
                            Some(_) => {}
                        }
                    }
                    Err(e) => return Err(e),
                }
            };
            main(AgentEvent::Status {
                state: "ready".into(),
            });

            while let Some(command) = commands.recv().await {
                match command {
                    Command::Prompt(text) => {
                        let request = PromptRequest::new(
                            session_id.clone(),
                            vec![ContentBlock::Text(TextContent::new(text))],
                        );
                        let turn = cx.send_request(request).block_task();
                        let mut turn = std::pin::pin!(turn);
                        loop {
                            tokio::select! {
                                done = &mut turn => {
                                    match done {
                                        Ok(r) => main(AgentEvent::TurnEnd { stop_reason: to_json(&r.stop_reason) }),
                                        // Some agents only ask for a sign-in once a prompt needs the model.
                                        Err(e) if is_auth_required(&e) => main(AgentEvent::AuthRequired {
                                            methods: auth_methods.clone(),
                                            message: e.message,
                                        }),
                                        Err(e) => main(AgentEvent::Error { message: e.message }),
                                    }
                                    break;
                                }
                                next = commands.recv() => match next {
                                    Some(Command::Cancel) => {
                                        cx.send_notification(CancelNotification::new(session_id.clone()))?;
                                    }
                                    Some(Command::Prompt(_)) => main(AgentEvent::Error {
                                        message: "wait for the current answer, or stop it first".into(),
                                    }),
                                    Some(Command::Authenticate(_)) => {}
                                    Some(Command::Stop) | None => return Ok(()),
                                },
                            }
                        }
                    }
                    Command::Authenticate(method) => {
                        match cx
                            .send_request(AuthenticateRequest::new(method))
                            .block_task()
                            .await
                        {
                            Ok(_) => main(AgentEvent::Status {
                                state: "ready".into(),
                            }),
                            Err(e) => main(AgentEvent::Error { message: e.message }),
                        }
                    }
                    Command::Cancel => {}
                    Command::Stop => return Ok(()),
                }
            }
            Ok(())
        })
        .await
        .map_err(|e| e.message)
}
