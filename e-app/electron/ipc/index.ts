import { registerOpenAIHandlers } from './openai'

/** Register every IPC surface. Called once, after the app is ready. */
export function registerIpcHandlers(): void {
  registerOpenAIHandlers()
}
