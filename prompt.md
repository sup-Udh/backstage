<USER_REQUEST>
# BACKSTAGE — COMPLETE AGENT MANAGEMENT, MULTI-AGENT CONCURRENCY & AGENT-TO-AGENT AWARENESS

We are now implementing the actual multi-agent system for Backstage.

This is a major functionality milestone.

The existing application already has:

- Electron
- React
- Backstage UI
- Pixel-art worlds
- Themes
- Characters
- Agent chat
- OpenAI integration
- Gemini integration
- Local workspace
- Filesystem access
- Git support
- PTY / terminal infrastructure
- Claude Code sessions
- Agent runtime
- Agent state
- Tasks
- Right-side command center
- Theme-specific characters

Now we need to build the actual agent management layer.

The goal is to make Backstage a proper multi-agent workspace where:

1. Users can create/configure agents.
2. Users can choose the provider.
3. Users can choose the model.
4. Agents have their own identities.
5. Multiple agents can work independently.
6. Talking to one agent does NOT block another.
7. Agents can work concurrently.
8. Agents can be assigned different tasks.
9. Agents can optionally communicate with each other.
10. Users can configure who talks to whom.
11. Users can create automatic triggers.
12. Agents can become aware of relevant workspace activity.
13. The pixel characters accurately represent the real agent state.

DO NOT redesign the existing landing page.

DO NOT redesign the pixel worlds.

DO NOT replace the existing theme system.

DO NOT break the existing OpenAI/Gemini integrations.

This is primarily an agent architecture + Agents page + orchestration feature.

---

# 1. CORE MENTAL MODEL

Backstage should treat every agent as an independent worker.

For example:

    JANE
    Provider: OpenAI
    Model: GPT-5-mini
    Role: Investigator

    MICHAEL
    Provider: Gemini
    Model: Gemini model
    Role: Developer

    PAM
    Provider: OpenAI
    Model: GPT-5-mini
    Role: Researcher

These are THREE independent agents.

They should NOT share:

- active task
- conversation state
- busy state
- current session
- input queue

unless explicitly configured to do so.

---

# 2. AGENT ENTITY

Create a proper persistent Agent model.

Conceptually:

    Agent

    id
    name
    displayName
    provider
    model
    role
    systemPrompt
    avatar
    theme
    enabled
    status
    capabilities
    workspace
    memory
    settings
    createdAt
    updatedAt

Do not blindly copy this schema.

Inspect the existing architecture and adapt it to the current stores/runtime.

The important thing is that an agent becomes a real persistent entity.

---

# 3. PROVIDERS

The agent creation flow must support at least:

    OpenAI
    Google Gemini

The architecture should make adding future providers straightforward.

Potential future providers:

    Anthropic
    OpenRouter
    local models
    Ollama
    other APIs

Do NOT hard-code the entire agent system around OpenAI.

Use the provider registry that already exists if possible.

---

# 4. API KEY REQUIREMENT

An agent cannot be spawned against a provider unless that provider has a valid configured connection.

Example:

If OpenAI API key exists:

    OPENAI
       ✓ Connected

Then:

    [ CREATE AGENT ]

can offer OpenAI models.

If Gemini key exists:

    GEMINI
       ✓ Connected

Then Gemini models become available.

If neither is configured:

    No provider connections available.

    Connect a provider to create an AI agent.

---

# 5. CONNECTIONS PAGE

The existing Connections/provider setup should become the source of truth.

The user should be able to configure:

    OpenAI
    Gemini
    future providers

Each provider should show:

    Provider
    Connection status
    API key status
    Available models
    [ TEST CONNECTION ]
    [ EDIT ]
    [ REMOVE ]

Example:

    ┌──────────────────────────────────────┐
    │ OPENAI                               │
    │                                      │
    │ ● CONNECTED                          │
    │ API key configured                   │
    │                                      │
    │ [ TEST CONNECTION ]                  │
    │ [ MANAGE ]                           │
    └──────────────────────────────────────┘

Same for Gemini.

---

# 6. API KEY SECURITY

This is important because this is an Electron application.

Do NOT store API keys casually in:

    localStorage
    React state
    plain JSON configuration
    visible renderer files

Use Electron's secure storage facilities where appropriate.

The renderer should not directly own raw API keys.

Architecture should be approximately:

    Renderer
       ↓
    typed IPC
       ↓
    Electron main
       ↓
    secure credential storage

The agent runtime/provider layer should retrieve credentials securely when
making provider requests.

Never expose the raw key to the UI after saving.

The UI should only know:

    Connected
    Not connected

and possibly masked metadata.

---

# 7. AGENTS PAGE

Build out the Agents page completely.

This should become the central place for creating and managing agents.

The page should feel like a real control panel.

Do NOT make it look like a generic SaaS settings page.

Keep the Backstage design language:

    warm cream
    #FFC94F
    dark navy
    Pixelify Sans labels
    compact borders
    pixel-inspired controls

---

# 8. AGENTS PAGE STRUCTURE

Conceptually:

    AGENTS

    Your AI team

    Create, configure and manage the agents
    working inside Backstage.

    [ + CREATE AGENT ]

    ─────────────────────────────────────

    YOUR AGENTS

    ┌─────────────────────────────────────┐
    │ JANE                                │
    │ Investigator                        │
    │                                     │
    │ OPENAI · GPT-5-MINI                 │
    │ ● READY                             │
    │                                     │
    │ [ EDIT ] [ TEST ] [ DISABLE ]      │
    └─────────────────────────────────────┘

    ┌─────────────────────────────────────┐
    │ MICHAEL                             │
    │ Developer                           │
    │                                     │
    │ GEMINI · MODEL                      │
    │ ● IDLE                              │
    │                                     │
    │ [ EDIT ] [ TEST ] [ DISABLE ]      │
    └─────────────────────────────────────┘

---

# 9. CREATE AGENT

The primary action:

    + CREATE AGENT

opens an agent creation interface.

The user should configure:

    Agent name
    Role
    Provider
    Model
    System prompt
    Theme/character
    Capabilities
    Workspace access
    Agent-to-agent permissions

---

# 10. CREATE AGENT FLOW

Step 1:

    NAME

    [ Jane ]

Step 2:

    ROLE

    [ Investigator ]

Step 3:

    PROVIDER

    [ OpenAI ▼ ]

Available providers should only include configured providers.

For example:

    OpenAI ✓
    Gemini ✓

or:

    OpenAI ✓
    Gemini — not connected

Do not allow creating a broken agent silently.

---

# 11. MODEL SELECTOR

After selecting OpenAI:

    MODEL

    [ GPT-5-mini ▼ ]

Show only models appropriate for the configured provider.

After selecting Gemini:

    MODEL

    [ Gemini model ▼ ]

The model list should come from the provider integration where possible,
rather than being an arbitrary static list.

If dynamic model discovery isn't available, keep the provider model
registry centralized.

Do NOT scatter model names across components.

---

# 12. MODEL INFORMATION

When a model is selected, show small metadata if available:

    GPT-5-mini

    Provider: OpenAI
    Context: ...
    Tools: Supported

Keep this compact.

---

# 13. AGENT ROLE

Provide a simple role field:

    ROLE

    [ Investigator ]

Examples:

    Investigator
    Developer
    Researcher
    Reviewer
    Designer
    Tester
    Analyst
    Custom

This role is both:

    human-readable identity

and:

    useful runtime metadata.

---

# 14. SYSTEM PROMPT

Allow the user to configure:

    SYSTEM PROMPT

For example:

    You are the investigator of the team.
    Inspect the project carefully before making conclusions.
    Prefer evidence from actual files.

This becomes the agent's persistent instruction.

Make the editor comfortable for longer text.

---

# 15. CAPABILITIES

Agents should have configurable capabilities.

For example:

    FILES
    ✓ Read
    ✓ Write

    TERMINAL
    ✓ Execute commands

    GIT
    ✓ Read status
    ✓ View diff
    □ Commit

    WEB
    □ Search web

    AGENTS
    ✓ Talk to other agents

Do NOT grant every capability automatically if the existing security
architecture supports permissions.

---

# 16. WORKSPACE ACCESS

An agent should be associated with a workspace.

Example:

    WORKSPACE

    e-app

or:

    Current workspace

An agent can therefore operate against the selected project.

Do not allow an agent to accidentally operate against an unrelated
workspace.

---

# 17. THEME / CHARACTER

The user should be able to choose which character represents the agent.

Example:

    THEME

    The Mentalist

    CHARACTER

    [ Jane ▼ ]

or:

    The Office

    [ Pam ▼ ]

The available characters should come from the selected theme.

Do not allow a Mentalist character to appear in The Office environment.

---

# 18. AGENT PREVIEW

While configuring the agent, show a small preview:

    JANE

    Investigator

    ● READY

with the pixel character.

This is a preview only.

Do not spawn the character into the active world until the agent is
actually created/activated.

---

# 19. SPAWN AGENT

The user should have an explicit:

    [ SPAWN AGENT ]

action.

This is different from merely saving an agent configuration.

The conceptual flow is:

    Configure agent
          ↓
    Save
          ↓
    Spawn
          ↓
    Agent becomes available in workspace
          ↓
    Character becomes available

---

# 20. IMPORTANT: SPAWN DOES NOT MEAN ALWAYS WORKING

An agent being spawned means:

    agent exists
    agent is available
    agent is connected to the workspace

It does NOT mean:

    agent is currently performing a task.

Therefore:

    spawned + no task = IDLE

The character should exist in the world only according to the existing
agent visibility rules.

---

# 21. AGENT LIFECYCLE

Define clear states.

At minimum:

    OFFLINE
    READY
    IDLE
    QUEUED
    THINKING
    WORKING
    TALKING
    WAITING
    ERROR

The exact state machine should be centralized.

Do not let individual UI components invent their own status.

---

# 22. MOST IMPORTANT MULTI-AGENT RULE

Agents MUST be independently executable.

Example:

    Jane is working on Task A.

User selects:

    Michael

User sends:

    "Check the database implementation."

Michael should begin working.

Jane continues working on Task A.

Nothing about talking to Michael should interrupt Jane.

---

# 23. CONCURRENT TASKS

Support:

    Jane → Task A → WORKING

    Michael → Task B → WORKING

    Pam → IDLE

All at the same time.

The world should show:

    Jane     ✦ WORKING
    Michael  ✦ WORKING
    Pam      ○ IDLE

The team header should update:

    3 AGENTS
    2 WORKING
    0 THINKING
    0 TALKING
    1 IDLE

---

# 24. CHAT MUST BE PER-AGENT

Every conversation must belong to an agent.

Conceptually:

    conversationId
    agentId
    workspaceId
    messages[]

Do not maintain one global conversation for all agents.

When the user switches:

    Jane → Michael

the conversation changes accordingly.

---

# 25. SWITCHING AGENTS

The user should be able to switch agents from:

    TALK TO [ Jane ▼ ]

without interrupting the previous agent.

Example:

    User talks to Jane.

Jane starts working.

User switches to:

    Michael

The chat panel becomes:

    MICHAEL

The user sends Michael a task.

Jane continues independently.

---

# 26. MULTI-AGENT CHAT STATE

When switching back:

    Jane

the user should see Jane's conversation/task state.

Nothing should be lost.

Example:

    JANE

    "I'm currently inspecting authentication."

    ● WORKING

The user can continue the conversation.

---

# 27. ALL AGENTS MODE

The TALK TO selector should support:

    ALL AGENTS

Example:

    TALK TO

    [ ALL AGENTS ▼ ]

If the user sends:

    "What do you think is the biggest problem in this project?"

the message should be explicitly routed to multiple agents.

Each agent can independently respond.

Example:

    JANE
    I think authentication is the main issue.

    MICHAEL
    I think the build pipeline is the bigger problem.

    PAM
    I think the UI architecture is the main concern.

Do NOT merge them into one fake response.

Show which agent produced each response.

---

# 28. ALL AGENTS SHOULD NOT AUTOMATICALLY WORK

Selecting:

    ALL AGENTS

does not mean every agent has to execute a full task every time.

Implement reasonable orchestration.

For example:

    broadcast message

can create independent agent turns.

Later we can add:

    ask one
    ask selected
    broadcast

---

# 29. AGENT-TO-AGENT COMMUNICATION

Now introduce agent awareness.

Agents should be able to communicate with each other.

But this MUST be controlled.

Do NOT allow uncontrolled infinite conversations.

---

# 30. AGENT RELATIONSHIPS

Create a concept of:

    Agent Relationship

Example:

    Jane → Michael

Meaning:

    Jane is allowed to communicate with Michael.

Or:

    Michael → Jane

Meaning:

    Michael can communicate with Jane.

These should be directional permissions.

---

# 31. AGENT COMMUNICATION CONFIGURATION

On the Agents page or a dedicated orchestration section, allow:

    JANE

    Can talk to:

    ☑ Michael
    ☑ Pam
    □ Everyone else

and:

    MICHAEL

    Can talk to:

    ☑ Jane
    □ Pam

This lets the user control the team graph.

---

# 32. VISUAL AGENT GRAPH

Add a lightweight:

    TEAM GRAPH

or:

    AGENT NETWORK

view.

Example:

    JANE ─────────→ MICHAEL
      │
      └──────────→ PAM

This is NOT a complex graph editor initially.

Just make the relationships understandable.

---

# 33. AGENT-TO-AGENT MESSAGE

When Jane communicates with Michael, create a real event:

    senderAgentId
    receiverAgentId
    message
    reason
    taskId
    timestamp

Example:

    Jane

    "Michael, I found the authentication code.
     Can you review the token validation?"

Michael receives that as an agent message.

---

# 34. AGENT AWARENESS

Agents should have access to relevant workspace awareness.

For example:

    active workspace
    current task
    relevant files
    recent tool actions
    Git state
    other active agents
    relevant agent messages

But DO NOT dump the entire workspace into every prompt.

Use contextual retrieval.

---

# 35. CONTEXT MODEL

Create a central awareness/context layer.

Conceptually:

    WorkspaceContext

    workspace
    files
    git
    activeTasks
    recentEvents
    activeAgents
    agentMessages

Agents can request relevant context.

---

# 36. EVENT SYSTEM

Create a central event stream.

Examples:

    FILE_CHANGED
    FILE_CREATED
    FILE_DELETED
    GIT_CHANGED
    TASK_CREATED
    TASK_COMPLETED
    AGENT_STARTED
    AGENT_FINISHED
    AGENT_ERROR
    AGENT_MESSAGE
    TERMINAL_STARTED
    TERMINAL_EXITED

This becomes the foundation for triggers.

---

# 37. TRIGGERS

Build a trigger system.

Conceptually:

    WHEN [event]
    IF [condition]
    THEN [action]

Example:

    WHEN Jane completes a task
    THEN ask Michael to review her changes.

---

# 38. TRIGGER BUILDER

Create a UI for this.

Example:

    AUTOMATIONS

    [ + CREATE TRIGGER ]

    WHEN

    [ Jane completes a task ▼ ]

    THEN

    [ Ask Michael to review ▼ ]

    MESSAGE

    [ Review Jane's changes and report issues. ]

    [ ENABLE ]

---

# 39. TRIGGER TYPES

Start with:

    Agent completes task
    Agent starts task
    Agent errors
    File changed
    Git changed
    Task created
    Task completed
    Agent message received

Add more later.

---

# 40. TRIGGER ACTIONS

Start with:

    Send message to agent
    Create task for agent
    Ask agent to review
    Notify user

Later:

    Run command
    Run workflow
    Start external CLI session

---

# 41. AUTO MODE

There should be a clear:

    AUTO

toggle.

For example:

    AGENT COLLABORATION

    AUTO ● ON

When enabled, configured agent relationships/triggers can automatically
execute.

When disabled:

    agents only communicate when explicitly instructed.

This is extremely important for predictability.

---

# 42. AUTO MODE SAFETY

AUTO mode must NOT create uncontrolled agent loops.

Implement protections:

    max messages per trigger
    cooldown
    max chain depth
    duplicate detection
    task-level correlation ID

Example:

    Jane → Michael
    Michael → Jane
    Jane → Michael
    Michael → Jane

must eventually stop.

---

# 43. MAX COLLABORATION DEPTH

Every automatic agent interaction should have a chain depth.

Example:

    Jane
      ↓ depth 1
    Michael
      ↓ depth 2
    Pam
      ↓ depth 3

Set a configurable maximum.

Example default:

    maxDepth = 3

Do not allow infinite chains.

---

# 44. COOLDOWN

Allow triggers to have:

    cooldown: 30 seconds

or another reasonable default.

This prevents an event storm.

---

# 45. HUMAN APPROVAL

For potentially dangerous actions, require user approval.

Especially:

    terminal commands
    destructive filesystem operations
    Git commits
    external side effects

Agent-to-agent communication itself can remain automatic.

But dangerous tools should respect the existing permission/approval
system.

---

# 46. AGENT-TO-AGENT UI

The user should be able to see when agents communicate.

Example:

    JANE → MICHAEL

    "Can you review the authentication changes?"

Then:

    MICHAEL → JANE

    "I found one issue in token validation."

This can appear as compact activity inside the relevant agent session.

Do NOT bring back the giant global Activity panel.

---

# 47. AGENT STATUS DURING COMMUNICATION

If Jane is talking to Michael:

    Jane → TALKING

Michael receiving the message can become:

    Michael → THINKING

or:

    WAITING

depending on implementation.

But do not mark every agent as WORKING just because another agent sent
them a message.

---

# 48. USER VS AGENT MESSAGE

The system must distinguish:

    USER
    JANE
    MICHAEL
    PAM
    SYSTEM

This is important for UI and orchestration.

---

# 49. CHARACTER BEHAVIOR

The pixel world should accurately reflect agent state.

Example:

    User talks to Jane

Jane:

    TALKING → WORKING → IDLE

Michael:

    remains IDLE

Pam:

    remains IDLE

Then user switches to Michael.

Michael:

    TALKING → WORKING

Jane:

    continues existing task OR remains WORKING if her task is still active

This is the key multi-agent experience.

---

# 50. TALKING TO ONE AGENT MUST NOT LOCK THE WORLD

Current problem:

When the user talks to one character, it can feel like that character owns
the entire application.

Fix this.

Each agent has independent:

    chat
    task
    state
    session
    context
    execution

The UI selector only changes which agent the user is interacting with.

---

# 51. AGENT TASK QUEUES

Each agent should have its own queue.

Example:

    JANE

    Current:
    Analyze authentication

    Queue:
    Review README

    MICHAEL

    Current:
    Fix build

    Queue:
    Run tests

Do not create one global queue that serializes all agents.

---

# 52. TASK ROUTING

When the user sends a task to Jane:

    Jane.taskQueue.add(task)

When the user switches to Michael:

    Michael.taskQueue.add(task)

Both can execute independently if their provider/runtime allows it.

---

# 53. PROVIDER INDEPENDENCE

OpenAI and Gemini agents must work simultaneously.

Example:

    Jane → OpenAI → GPT-5-mini
    Michael → Gemini → selected model

They should have independent provider clients/configuration.

Do not create one global:

    currentProvider

state.

Use:

    agent.provider

and:

    agent.model

---

# 54. MODEL SELECTION MUST BELONG TO THE AGENT

If Jane uses:

    GPT-5-mini

and Michael uses:

    Gemini model

switching between them should not modify the other.

The selected model is stored in the agent configuration.

---

# 55. CONNECTION FAILURE

If a provider fails:

    Jane → ERROR

Michael should continue working.

The team header should reflect:

    2 AGENTS
    1 WORKING
    1 ERROR

Do not crash the entire agent runtime.

---

# 56. AGENT CREATION VALIDATION

Before spawning:

Check:

    provider connected?
    model valid?
    name present?
    system prompt valid?
    workspace selected?
    required capabilities available?

If not:

    show the exact reason.

Do not allow a broken agent to appear as READY.

---

# 57. AGENT EDITING

Every agent card should have:

    EDIT

The edit page should allow:

    name
    role
    provider
    model
    system prompt
    capabilities
    theme
    character
    communication permissions

Changes should persist.

---

# 58. AGENT DISABLE

Allow:

    DISABLE AGENT

Disabled means:

    agent remains configured
    agent cannot receive new tasks
    character should not appear as active
    triggers should not dispatch new tasks to it

Do not delete the agent.

---

# 59. DELETE AGENT

Deletion should require confirmation.

Example:

    DELETE JANE?

    This removes the agent configuration.
    Existing conversation history may be preserved
    depending on the current data model.

    [ CANCEL ] [ DELETE ]

---

# 60. SPAWN / DESPAWN

Consider the difference:

    CONFIGURED
    SPAWNED
    ACTIVE
    IDLE

A configured agent doesn't necessarily need to be actively spawned.

The UI can show:

    CONFIGURED

and:

    SPAWN

When spawned:

    SPAWNED
    IDLE

This will become useful later for resource management.

---

# 61. AGENT RESOURCE MANAGEMENT

Do not instantiate unnecessary provider sessions for every idle agent.

An idle agent should be lightweight.

Create provider execution context when the agent actually receives work.

This will make multi-agent concurrency much more scalable.

---

# 62. AGENT MEMORY

Each agent should have independent conversation memory.

Example:

    Jane remembers her conversations.

    Michael remembers his conversations.

They should not accidentally share private conversation history.

Shared workspace awareness is different from private conversation memory.

---

# 63. SHARED WORLD AWARENESS

Agents should be able to know:

    Jane is working on authentication.

    Michael is reviewing the API.

    Pam is idle.

But this should come from structured state:

    activeAgents
    activeTasks
    events

not from dumping another agent's entire private chat history.

---

# 64. AGENT CONTEXT PANEL

On the Agents page, allow a small:

    AWARENESS

section.

Show:

    Workspace
    Active agents
    Current tasks
    Git state
    Recent relevant events

This helps debug the orchestration system.

---

# 65. AUTOMATIONS PAGE / SECTION

The application should now have a dedicated place for:

    AGENT AUTOMATIONS

Example:

    AUTO COLLABORATION
    ● ON

    TRIGGERS

    Jane completes task
       ↓
    Ask Michael to review

    Michael finds issue
       ↓
    Ask Jane to fix

This becomes a visual representation of the agent workflow.

---

# 66. TRIGGER CARD

Example:

    ┌────────────────────────────────────────┐
    │ ✓ ENABLED                              │
    │                                        │
    │ JANE COMPLETES TASK                    │
    │          ↓                             │
    │ MICHAEL REVIEWS                        │
    │                                        │
    │ Max chain: 3                           │
    │ Cooldown: 30s                          │
    │                                        │
    │ [ EDIT ] [ DISABLE ]                  │
    └────────────────────────────────────────┘

---

# 67. CREATE TRIGGER

Flow:

    + CREATE TRIGGER

    EVENT

    [ Agent completes task ▼ ]

    SOURCE AGENT

    [ Jane ▼ ]

    ACTION

    [ Send task ▼ ]

    TARGET AGENT

    [ Michael ▼ ]

    MESSAGE

    [ Review the completed work for problems. ]

    SAFETY

    Max chain:
    [ 3 ]

    Cooldown:
    [ 30s ]

    [ ENABLE TRIGGER ]

---

# 68. AGENT RELATIONSHIP GRAPH

Allow a simple graph view:

    JANE
      │
      ├────────→ MICHAEL
      │
      └────────→ PAM

    MICHAEL
      │
      └────────→ JANE

This gives the user an intuitive understanding of their agent network.

---

# 69. AGENT COMMUNICATION LOG

Inside an agent's session, show:

    COLLABORATION

    Jane → Michael
    13:45

    "Review authentication."

This should be separate from normal user conversation.

---

# 70. USER SHOULD ALWAYS KNOW WHO THEY ARE TALKING TO

At all times the chat panel should clearly show:

    JANE
    INVESTIGATOR
    OPENAI · GPT-5-MINI

or:

    MICHAEL
    DEVELOPER
    GEMINI · MODEL

This avoids confusion when switching between agents.

---

# 71. ALL AGENTS INDICATOR

When:

    TALK TO → ALL AGENTS

show:

    ALL AGENTS

and maybe:

    3 recipients

before sending.

This prevents accidental broadcast.

---

# 72. LIVE SWITCHING

Switching agents should feel instant.

Do not reload the entire workspace.

Do not recreate the pixel world.

Do not reset other agent states.

Only change:

    selectedAgentId

and the corresponding panel state.

---

# 73. AGENT STORE

Centralize agent state.

Conceptually:

    agents
    selectedAgentId
    activeTasks
    conversations
    relationships
    triggers
    collaborationEvents

Do not duplicate these states across random React components.

---

# 74. ORCHESTRATOR

Create or extend a central:

    AgentOrchestrator

responsible for:

    task dispatch
    agent execution
    concurrency
    agent messages
    triggers
    awareness
    lifecycle
    cancellation
    errors

The UI should not directly orchestrate agents.

---

# 75. EVENT BUS

Use a central event mechanism.

Conceptually:

    eventBus.emit({
        type: "TASK_COMPLETED",
        agentId: jane,
        taskId: task
    })

Triggers listen to these events.

This will make the system much easier to extend.

---

# 76. EXECUTION ISOLATION

Each task execution must have:

    executionId

and:

    agentId
    taskId
    workspaceId

This prevents output from one agent appearing in another agent's session.

---

# 77. CANCELLATION

The user should be able to stop an individual agent.

Example:

    Jane
    ● WORKING

    [ STOP ]

Stopping Jane should:

    cancel Jane's execution

but NOT:

    stop Michael
    stop Pam
    close the world
    crash the runtime

---

# 78. RETRY

If an agent fails:

    ERROR

provide:

    [ RETRY ]

Retry only that execution.

---

# 79. AGENT SPAWN UX

The final creation experience should feel fun.

For example:

    CREATE NEW AGENT

    Who's joining the team?

    NAME
    [ Jane ]

    ROLE
    [ Investigator ]

    PROVIDER
    [ OpenAI ]

    MODEL
    [ GPT-5-mini ]

    CHARACTER
    [ Jane ]

    SYSTEM PROMPT
    [ ... ]

    CAPABILITIES
    ☑ Files
    ☑ Terminal
    ☑ Git
    ☑ Workspace awareness
    ☑ Agent communication

                     [ SPAWN AGENT ]

When clicked:

    character enters world
    ↓
    agent appears in team
    ↓
    status = IDLE
    ↓
    agent is available

This should feel like an agent joining the office.

---

# 80. SPAWN ANIMATION

When a new agent is spawned:

    character walks/appears into the environment

Use the existing character animation system.

Do not create an elaborate new animation system.

A small:

    entering office
    walking to desk
    becoming idle

sequence would be ideal.

---

# 81. AGENT COMMUNICATION SHOULD ALSO BE VISIBLE

If Jane sends something to Michael:

    Jane
       ↓
    walks/communicates visually if appropriate
       ↓
    Michael

But do NOT force literal walking every time.

A subtle:

    💬
    communication indicator

is enough.

The real source of truth is the agent event system.

---

# 82. AUTO COLLABORATION BUTTON

Provide a clear control in the workspace:

    AUTO COLLABORATION
    [ ON ]

or:

    AUTO
    ● ON

When OFF:

    only explicit user tasks/messages trigger agent interaction.

When ON:

    configured triggers may execute.

---

# 83. AUTO MODE MUST BE PERSISTENT

Store the setting.

It should survive application restarts.

But do not automatically enable it for the user unless that is already the
existing product decision.

Make the current state obvious.

---

# 84. DEFAULT SAFETY

Default:

    AUTO = OFF

until the user explicitly enables it.

This avoids surprising API usage.

---

# 85. API COST CONTROL

Multi-agent automation can generate many provider calls.

Add basic protection.

Track:

    execution count
    trigger count
    collaboration depth
    recent calls

Make it possible to stop automation globally.

For example:

    [ STOP ALL AGENTS ]

This should cancel active Backstage agent tasks safely.

It should not kill unrelated external processes unless explicitly intended.

---

# 86. GLOBAL EMERGENCY STOP

In the Agents/Automation interface:

    STOP ALL

This means:

    stop Backstage-managed agent executions.

Do not automatically kill arbitrary external terminal sessions.

---

# 87. TEST SCENARIO

After implementation, test this exact scenario.

Create:

    Jane
    OpenAI
    GPT-5-mini
    Investigator

Create:

    Michael
    Gemini
    selected Gemini model
    Developer

Spawn both.

World:

    Jane → IDLE
    Michael → IDLE

User talks to Jane:

    "Analyze the authentication system."

Jane:

    WORKING

Michael:

    IDLE

Now immediately switch to Michael.

Ask:

    "Check the build system."

Michael:

    WORKING

Jane:

    continues WORKING

The UI should show:

    2 AGENTS
    2 WORKING

The user can switch between:

    Jane
    Michael

without interrupting either.

---

# 88. TEST AGENT COLLABORATION

Create trigger:

    Jane completes task
       ↓
    Michael reviews it

Jane completes.

System emits:

    TASK_COMPLETED

Trigger fires.

Michael receives:

    "Review Jane's completed work."

Michael starts:

    THINKING
    ↓
    WORKING

Jane:

    IDLE

The user sees the collaboration event.

---

# 89. TEST SECOND TRIGGER

Create:

    Michael finds an issue
       ↓
    Ask Jane to fix it

Michael sends message.

Jane receives task.

Jane becomes:

    WORKING

This creates:

    Jane ↔ Michael

but only because the user explicitly configured those triggers.

---

# 90. TEST LOOP PROTECTION

Create:

    Jane → Michael
    Michael → Jane

with AUTO enabled.

Verify the system does NOT endlessly loop.

The chain should stop after:

    maxDepth

or:

    duplicate detection

or:

    cooldown

whichever is reached first.

---

# 91. UI POLISH

Use the existing Backstage visual language.

Do NOT turn the Agents page into a generic dashboard.

Use:

    cream
    #FFC94F
    dark navy
    Pixelify Sans
    pixel borders
    compact controls

The Agents page should feel like:

    "HR department for AI workers"

mixed with:

    "developer orchestration console"

while still feeling like Backstage.

---

# 92. AGENT CARD

Agent cards should be compact.

Example:

    ┌──────────────────────────────────────┐
    │ JANE                                 │
    │ INVESTIGATOR                         │
    │                                      │
    │ OPENAI · GPT-5-MINI                  │
    │ ● IDLE                               │
    │                                      │
    │ [ EDIT ]       [ SPAWN ]             │
    └──────────────────────────────────────┘

Do not use huge cards.

---

# 93. AGENT STATUS SHOULD BE LIVE

Agent cards update in real time.

If Jane starts working:

    ● IDLE

becomes:

    ✦ WORKING

without refreshing the page.

---

# 94. DO NOT CONFUSE SPAWNED WITH ACTIVE

Example:

    Jane
    ● SPAWNED
    ○ IDLE

This means:

    Jane exists in the world
    but isn't currently doing work.

When task starts:

    Jane
    ✦ WORKING

---

# 95. PROVIDER BADGE

Show:

    OPENAI
    GPT-5-MINI

or:

    GEMINI
    MODEL

as compact metadata.

This is useful when managing multiple agents.

---

# 96. FUTURE EXTENSIBILITY

Architect this so we can later add:

    Claude API
    Anthropic
    OpenRouter
    Ollama
    local models

without redesigning Agent.

Provider should be an abstraction.

Agent should simply reference:

    providerId
    modelId

---

# 97. DO NOT REBUILD WORKING PROVIDERS

Inspect the existing OpenAI and Gemini implementation.

Reuse:

    provider registry
    provider clients
    API connection state
    model discovery

Extend them to support multiple agent instances.

Do not duplicate API implementations.

---

# 98. MOST IMPORTANT ARCHITECTURAL RULE

NEVER use global state like:

    currentAgentProvider
    currentAgentModel
    currentAgentTask

to represent the whole runtime.

Those values belong to an individual agent/execution.

Use:

    agentId

as the primary identity.

Every execution should be traceable:

    execution
       ↓
    agent
       ↓
    provider
       ↓
    model
       ↓
    workspace
       ↓
    task

---

# 99. FINAL PRODUCT EXPERIENCE

The finished Backstage experience should feel like this:

The user opens a workspace.

They see:

    THE OFFICE

with:

    Jane
    Michael
    Pam

walking around.

The user goes to:

    AGENTS

and creates:

    Jane
    OpenAI
    GPT-5-mini
    Investigator

Then:

    Michael
    Gemini
    Gemini model
    Developer

They spawn them.

The characters appear.

Jane can work.

Michael can work.

The user can talk to Jane while Michael is independently working.

The user switches to Michael.

Michael continues.

Jane continues.

The user can configure:

    Jane → Michael

so Jane can ask Michael for help.

They can configure:

    Michael → Jane

so Michael can send work back.

They can create:

    WHEN Jane finishes
    THEN Michael reviews

They can enable:

    AUTO COLLABORATION

and Backstage orchestrates those interactions.

The pixel world visually represents everything.

The right-side command center provides control.

The Agents page provides configuration.

The Automation/Triggers page provides orchestration.

---

# 100. IMPLEMENTATION ORDER

Do NOT attempt to build everything randomly.

Implement in this exact order:

PHASE 1
    Agent data model

PHASE 2
    Multiple independent agent instances

PHASE 3
    Provider/model configuration per agent

PHASE 4
    Complete Agents page

PHASE 5
    Create/Edit/Spawn/Disable/Delete

PHASE 6
    Per-agent conversations

PHASE 7
    Independent concurrent execution

PHASE 8
    Agent switching without interrupting tasks

PHASE 9
    ALL AGENTS mode

PHASE 10
    Workspace awareness/context layer

PHASE 11
    Central event bus

PHASE 12
    Agent-to-agent messaging

PHASE 13
    Agent relationships

PHASE 14
    Trigger engine

PHASE 15
    Automation UI

PHASE 16
    AUTO mode

PHASE 17
    Loop protection / depth / cooldown

PHASE 18
    Pixel-world state synchronization

PHASE 19
    Real-time UI updates

PHASE 20
    Testing and polish

---

# FINAL PRINCIPLE

Backstage is NOT:

    one chatbot
    with multiple characters.

Backstage is:

    MULTIPLE INDEPENDENT AI WORKERS

living inside:

    ONE SHARED WORKSPACE

with:

    SHARED WORLD AWARENESS

and optionally:

    CONTROLLED AGENT-TO-AGENT COMMUNICATION.

The user is the manager.

Agents are the workers.

The pixel world is the office.

The Agents page is the team management system.

The right-side command center is the user's workstation.

The event/trigger system is the orchestration layer.

The provider system determines which AI model powers each worker.

Build this architecture cleanly now because this will become the foundation
for everything that comes after it.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-08-19T19:58:08+05:30.
</ADDITIONAL_METADATA>