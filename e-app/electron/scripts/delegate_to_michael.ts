import { systemBus } from '../agents/EventBus'

// This script prepares a delegation event for Michael.
// It does not execute the app runtime. Run this inside the app runtime to actually emit the event.

const event = {
  type: 'agent.delegated',
  at: Date.now(),
  taskId: `delegate-${Date.now()}`,
  agentId: 'jane', // originating agent (placeholder)
  agentName: 'Jane',
  targetAgentId: 'michael',
  message: `Write a short 4-line poem about the project's dependencies. Mention or allude to these runtime dependencies: @fontsource/inter, @fontsource/jetbrains-mono, @fontsource/pixelify-sans, @google/genai, @lydell/node-pty, @xterm/addon-fit, @xterm/xterm, chokidar, openai, react, react-dom, zustand.`
}

// Emit the event on the central EventBus. This will be picked up by the TriggerEngine / AgentRuntime if they are running.
systemBus.emitEvent(event as any)

console.log('Prepared delegation event for Michael (not executed):', event.taskId)
