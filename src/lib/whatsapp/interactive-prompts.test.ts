import { describe, it, expect } from 'vitest'
import { resolveInteractiveOptions } from './interactive-prompts'

describe('resolveInteractiveOptions', () => {
  it('resolves options for "What\'s your primary business goal right now?"', () => {
    const meta = resolveInteractiveOptions({
      content_text: "🎯 What's your *primary business goal* right now?",
      content_type: 'interactive',
    })

    expect(meta).not.toBeNull()
    expect(meta?.kind).toBe('list')
    expect(meta?.button_label).toBe('Select your goal')
    expect(meta?.options.length).toBeGreaterThanOrEqual(6)
    expect(meta?.options.some((o) => o.title === 'Generate More Leads')).toBe(true)
    expect(meta?.options.some((o) => o.title === 'Increase Sales')).toBe(true)
  })

  it('resolves options even without emoji or markdown asterisks', () => {
    const meta = resolveInteractiveOptions({
      content_text: "What's your primary business goal right now?",
      content_type: 'text',
    })

    expect(meta).not.toBeNull()
    expect(meta?.options.some((o) => o.title === 'Increase Sales')).toBe(true)
  })

  it('resolves options for "Which service are you looking for?"', () => {
    const meta = resolveInteractiveOptions({
      content_text: "🛠️ Which service are you looking for?",
      content_type: 'interactive',
    })

    expect(meta).not.toBeNull()
    expect(meta?.options.some((o) => o.title.includes('Performance Mktg'))).toBe(true)
  })

  it('prefers explicit referral_data.interactive_data when present', () => {
    const custom = resolveInteractiveOptions({
      content_text: "Custom Question",
      content_type: 'interactive',
      referral_data: {
        interactive_data: {
          kind: 'buttons',
          buttons: [
            { id: 'b1', title: 'Option Alpha' },
            { id: 'b2', title: 'Option Beta' },
          ],
        },
      },
    })

    expect(custom).not.toBeNull()
    expect(custom?.kind).toBe('buttons')
    expect(custom?.options).toEqual([
      { id: 'b1', title: 'Option Alpha' },
      { id: 'b2', title: 'Option Beta' },
    ])
  })

  it('returns null for standard messages with no interactive metadata', () => {
    const regular = resolveInteractiveOptions({
      content_text: "Hello, thank you for your message!",
      content_type: 'text',
    })

    expect(regular).toBeNull()
  })
})
