import { FakeAgentRuntime } from './fakeAgentRuntime'

/**
 * The landing page's office.
 *
 * Deliberately its own runtime, with no connection to the real team. The
 * workspace shows only agents that have been brought in by a task, so its
 * office starts empty — correct there, and wrong for a shop window. This one
 * is always populated and always busy.
 *
 * It never calls a provider, spends anything, or touches the filesystem: the
 * ambient scheduler moves everyone between working, thinking, talking and
 * idle on a timer. Purely for show.
 */
const SHOWCASE_CAST = [
  { slot: 0, name: 'Jane', role: 'Consultant' },
  { slot: 1, name: 'Lisbon', role: 'Team Lead' },
  { slot: 2, name: 'Cho', role: 'Technical Investigator' },
  { slot: 3, name: 'Van Pelt', role: 'Research Specialist' },
  { slot: 4, name: 'Rigsby', role: 'Field Agent' },
  { slot: 5, name: 'Wainwright', role: 'Supervisor' },
  { slot: 6, name: 'Hightower', role: 'Director' },
  { slot: 7, name: 'Bertram', role: 'Liaison' }
]

const MODELS = ['Claude Opus', 'Claude Sonnet', 'GPT-5', 'Gemini Pro']

export const showcaseRuntime = new FakeAgentRuntime(
  SHOWCASE_CAST.map((c, i) => ({
    id: `showcase-${c.slot}`,
    model: MODELS[i % MODELS.length],
    name: c.name,
    role: c.role,
    slot: c.slot
  })),
  4242
)

// A full house, so the room reads as a working office at a glance.
showcaseRuntime.populate()
