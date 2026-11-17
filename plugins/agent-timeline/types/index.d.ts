export type StepStatus = 'pending' | 'in_progress' | 'completed'

export type Step = { content: string; status: StepStatus }

export type EventKind = 'plan' | 'step' | 'prompt' | 'recap' | 'pr'

export type TimelineEvent = {
  at: number
  kind: EventKind
  text: string
  status?: StepStatus
}

/** A progress report over one interval; a higher level combines the level below. */
export type Report = {
  /** 0: every 15 minutes, 1: every hour, 2: every 4 hours. */
  level: number
  from: number
  to: number
  text: string
}

/** What one update_plan call changed: shown under its row in the conversation. */
export type PlanChange = {
  /** The call's tool_use_id. */
  id: string
  before: number
  after: number
  total: number
  lines: string[]
}

export type Board = {
  steps: Step[]
  events: TimelineEvent[]
  lastPrompt?: { at: number; text: string }
  lastRecap?: { at: number; text: string; turnId?: string }
  prs: string[]
  isWorking: boolean
  startedAt?: number
  lastAt?: number
  showAll: boolean
  title?: string
  needsYou: boolean
  /** When the current plan was first made: what elapsed time counts from. */
  planAt?: number
  /** The last tool call: an interval with none since its start gets no report. */
  lastToolAt?: number
  reports: Report[]
  /** Per level, the end of the last interval reported on. */
  reportedTo: number[]
  changes: PlanChange[]
  /** What this session is for: summed up from the prompts, or written with /timeline goal. */
  goal?: Goal
}

export type Goal = {
  text: string
  at: number
  /** Written by the person: the prompts no longer rewrite it. */
  isManual: boolean
}

/** One session's card as it writes it to the shared folder. */
export type Card = {
  id: string
  /** The session's id in the desktop app (local_...). */
  localId?: string
  /** For a session another one started: that session's localId. */
  parentId?: string
  /** The session's title in the desktop app's sidebar. */
  title?: string
  cwd: string
  savedAt: number
  board: Board
}

declare module 'claude-code' {
  interface PluginState {
    'agent-timeline': {
      board: Shaped<Board>
      cards: Shaped<Card[]>
      openId: Shaped<string>
      /** Bumped every minute so the band's elapsed and remaining times redraw. */
      tick: Shaped<number>
    }
  }
}
