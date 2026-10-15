import { listFlowTemplates } from '@/lib/flows/templates'
import type { Message } from '@/types'

export interface InteractiveOption {
  id: string
  title: string
  description?: string
}

export interface InteractivePromptMetadata {
  kind: 'buttons' | 'list'
  button_label?: string
  options: InteractiveOption[]
}

/**
 * Normalizes text for loose matching: strips markdown asterisks, emojis,
 * extra spaces, and lowercases.
 */
function normalizePromptText(text: string): string {
  return text
    .replace(/\*/g, '')
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Cache of all interactive prompt nodes compiled across all known flow templates.
 */
let _cachedFlowPromptMap: Map<string, InteractivePromptMetadata> | null = null

function getFlowPromptMap(): Map<string, InteractivePromptMetadata> {
  if (_cachedFlowPromptMap) return _cachedFlowPromptMap

  const map = new Map<string, InteractivePromptMetadata>()
  const templates = listFlowTemplates()

  for (const t of templates) {
    for (const node of t.nodes) {
      if (node.node_type === 'send_buttons') {
        const cfg = node.config as { text: string; buttons: Array<{ reply_id: string; title: string }> }
        if (cfg?.text && cfg.buttons?.length) {
          const norm = normalizePromptText(cfg.text)
          map.set(norm, {
            kind: 'buttons',
            options: cfg.buttons.map((b) => ({ id: b.reply_id, title: b.title })),
          })
        }
      } else if (node.node_type === 'send_list') {
        const cfg = node.config as {
          text: string
          button_label?: string
          sections?: Array<{
            title: string
            rows: Array<{ reply_id: string; title: string; description?: string }>
          }>
        }
        if (cfg?.text && cfg.sections?.length) {
          const norm = normalizePromptText(cfg.text)
          const allRows: InteractiveOption[] = []
          for (const s of cfg.sections) {
            for (const r of s.rows ?? []) {
              allRows.push({
                id: r.reply_id,
                title: r.title,
                description: r.description,
              })
            }
          }
          if (allRows.length > 0) {
            map.set(norm, {
              kind: 'list',
              button_label: cfg.button_label,
              options: allRows,
            })
          }
        }
      }
    }
  }

  _cachedFlowPromptMap = map
  return map
}

/**
 * Resolves interactive buttons / list options for a message.
 * Checks in order:
 * 1. Explicit `referral_data.interactive_data` if attached during send.
 * 2. Static flow prompt match from known flow templates.
 */
export function resolveInteractiveOptions(
  message: Pick<Message, 'content_text' | 'referral_data' | 'content_type'>
): InteractivePromptMetadata | null {
  // 1. Check referral_data for persisted interactive metadata
  const refData = message.referral_data as Record<string, unknown> | null | undefined
  const customInteractive = refData?.interactive_data as
    | {
        kind?: 'buttons' | 'list'
        button_label?: string
        buttons?: Array<{ id: string; title: string }>
        sections?: Array<{
          title: string
          rows: Array<{ id: string; title: string; description?: string }>
        }>
      }
    | undefined

  if (customInteractive) {
    const kind = customInteractive.kind || 'buttons'
    if (kind === 'buttons' && customInteractive.buttons?.length) {
      return {
        kind: 'buttons',
        button_label: customInteractive.button_label,
        options: customInteractive.buttons.map((b) => ({ id: b.id, title: b.title })),
      }
    }
    if (kind === 'list' && customInteractive.sections?.length) {
      const rows: InteractiveOption[] = []
      for (const s of customInteractive.sections) {
        for (const r of s.rows ?? []) {
          rows.push({ id: r.id, title: r.title, description: r.description })
        }
      }
      if (rows.length > 0) {
        return {
          kind: 'list',
          button_label: customInteractive.button_label,
          options: rows,
        }
      }
    }
  }

  // 2. Fall back to flow templates lookup by content_text
  const text = message.content_text
  if (!text) return null

  const promptMap = getFlowPromptMap()
  const normalized = normalizePromptText(text)

  // Direct match on normalized prompt text
  const match = promptMap.get(normalized)
  if (match) return match

  // Partial match: check if any registered prompt is contained in text or vice versa
  for (const [key, value] of promptMap.entries()) {
    if (key.length > 10 && (normalized.includes(key) || key.includes(normalized))) {
      return value
    }
  }

  return null
}
