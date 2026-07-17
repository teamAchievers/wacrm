import { supabaseAdmin } from '../automations/admin-client'
import { decrypt } from '../whatsapp/encryption'
import { engineSendText } from '../automations/meta-send'

interface ChatbotConfigRow {
  id: string
  account_id: string
  is_enabled: boolean
  provider: 'gemini' | 'openai'
  api_key: string
  system_prompt: string
  handoff_keywords: string
}

export async function handleChatbotReply(
  accountId: string,
  conversationId: string,
  contactId: string,
  messageText: string
): Promise<void> {
  const db = supabaseAdmin()

  // 1. Fetch chatbot config
  const { data: config, error: configErr } = await db
    .from('chatbot_config')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle()

  if (configErr || !config || !config.is_enabled || !config.api_key) {
    return
  }

  const typedConfig = config as ChatbotConfigRow

  // 2. Check if already assigned to a human agent or if bot is disabled for this chat
  const { data: conversation, error: convErr } = await db
    .from('conversations')
    .select('assigned_agent_id, chatbot_enabled')
    .eq('id', conversationId)
    .single()

  if (convErr || !conversation || conversation.chatbot_enabled === false || conversation.assigned_agent_id) {
    // Already assigned to a human agent or bot toggle is off, do not auto-reply
    return
  }

  // Get owner user_id to use as sender of record
  const { data: account, error: accErr } = await db
    .from('accounts')
    .select('owner_user_id')
    .eq('id', accountId)
    .single()

  if (accErr || !account) {
    console.error('[chatbot] failed to resolve account owner:', accErr)
    return
  }

  const ownerId = account.owner_user_id

  // 3. Evaluate local handoff keywords
  const keywords = typedConfig.handoff_keywords
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)

  const normalizedInput = messageText.toLowerCase()
  const matchesKeyword = keywords.some((kw) => normalizedInput.includes(kw))

  if (matchesKeyword) {
    await triggerHandoff(accountId, conversationId, contactId, ownerId)
    return
  }

  // 4. Load recent message history for context (last 10 messages)
  const { data: history, error: historyErr } = await db
    .from('messages')
    .select('sender_type, content_text')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (historyErr) {
    console.error('[chatbot] failed to load message history:', historyErr)
    return
  }

  // Reverse to chronological order
  const messages = (history || []).reverse()

  // 5. Call LLM API (Gemini or OpenAI)
  let replyText = ''
  try {
    const decryptedApiKey = decrypt(typedConfig.api_key)
    if (typedConfig.provider === 'gemini') {
      replyText = await callGemini(typedConfig.system_prompt, messages, decryptedApiKey)
    } else {
      replyText = await callOpenAI(typedConfig.system_prompt, messages, decryptedApiKey)
    }
  } catch (err) {
    console.error('[chatbot] LLM request failed:', err)
    return
  }

  // 6. Process AI response for tags and handoff triggers
  const tagRegex = /\[TAG:\s*(Cold|Warm|Hot|Qualified)\]/i
  const tagMatch = replyText.match(tagRegex)
  if (tagMatch) {
    const matchedTagName = tagMatch[1]
    const normalizedTagName = ['Cold', 'Warm', 'Hot', 'Qualified'].find(
      (t) => t.toLowerCase() === matchedTagName.toLowerCase()
    )
    if (normalizedTagName) {
      syncLeadTag(accountId, contactId, ownerId, normalizedTagName).catch((err) =>
        console.error('[chatbot] failed to sync lead tag:', err)
      )
    }
    replyText = replyText.replace(tagRegex, '').trim()
  }

  if (replyText.includes('[HANDOFF]') || replyText.trim() === 'HANDOFF') {
    replyText = replyText.replace('[HANDOFF]', '').trim()
    // If LLM stripped the message but triggered handoff, send fallback notice
    if (!replyText) {
      replyText = 'Transferring you to a human agent. Please wait...'
    }
    try {
      await engineSendText({
        accountId,
        userId: ownerId,
        conversationId,
        contactId,
        text: replyText,
      })
    } catch (err) {
      console.error('[chatbot] failed to send handoff reply:', err)
    }
    await triggerHandoff(accountId, conversationId, contactId, ownerId, false)
    return
  }

  // 7. Send the reply back to the contact via WhatsApp
  try {
    await engineSendText({
      accountId,
      userId: ownerId,
      conversationId,
      contactId,
      text: replyText,
    })
  } catch (err) {
    console.error('[chatbot] failed to send auto-reply:', err)
  }
}

async function triggerHandoff(
  accountId: string,
  conversationId: string,
  contactId: string,
  ownerId: string,
  sendNotice: boolean = true
): Promise<void> {
  const db = supabaseAdmin()

  // Assign to owner and disable chatbot for this chat
  await db
    .from('conversations')
    .update({ assigned_agent_id: ownerId, chatbot_enabled: false })
    .eq('id', conversationId)

  // Send human handoff notice if requested
  if (sendNotice) {
    try {
      await engineSendText({
        accountId,
        userId: ownerId,
        conversationId,
        contactId,
        text: 'Transferring you to a human agent. Please wait...',
      })
    } catch (err) {
      console.error('[chatbot] failed to send handoff notice:', err)
    }
  }
}

async function syncLeadTag(
  accountId: string,
  contactId: string,
  ownerId: string,
  tagName: string
): Promise<void> {
  const db = supabaseAdmin()
  const tempTags = ['Cold', 'Warm', 'Hot', 'Qualified']
  if (!tempTags.includes(tagName)) return

  const tagColors: Record<string, string> = {
    Qualified: '#22c55e',
    Hot: '#ef4444',
    Warm: '#f59e0b',
    Cold: '#3b82f6',
  }

  // 1. Find or create the tag
  let { data: tag, error: tagFetchErr } = await db
    .from('tags')
    .select('id')
    .eq('account_id', accountId)
    .eq('name', tagName)
    .maybeSingle()

  if (tagFetchErr) {
    console.error('[chatbot] failed to fetch tag:', tagFetchErr)
    return
  }

  if (!tag) {
    const { data: newTag, error: tagCreateErr } = await db
      .from('tags')
      .insert({
        name: tagName,
        color: tagColors[tagName],
        account_id: accountId,
        user_id: ownerId,
      })
      .select('id')
      .single()

    if (tagCreateErr || !newTag) {
      console.error('[chatbot] failed to create tag:', tagCreateErr)
      return
    }
    tag = newTag
  }

  // 2. Fetch existing temp tags for account to clean them up
  const { data: existingTags, error: listTagsErr } = await db
    .from('tags')
    .select('id')
    .eq('account_id', accountId)
    .in('name', tempTags)

  if (listTagsErr || !existingTags) {
    console.error('[chatbot] failed to list temperature tags:', listTagsErr)
    return
  }

  const tagIdsToRemove = existingTags.map((t) => t.id)

  if (tagIdsToRemove.length > 0) {
    await db
      .from('contact_tags')
      .delete()
      .eq('contact_id', contactId)
      .in('tag_id', tagIdsToRemove)
  }

  // 3. Upsert contact tag
  await db
    .from('contact_tags')
    .upsert(
      { contact_id: contactId, tag_id: tag.id },
      { onConflict: 'contact_id,tag_id', ignoreDuplicates: true }
    )
}

interface MessageHistory {
  sender_type: 'customer' | 'agent' | 'bot'
  content_text: string | null
}

async function callGemini(
  systemPrompt: string,
  history: MessageHistory[],
  apiKey: string
): Promise<string> {
  const decorator = `\n\n[System Instructions]\n` +
    `1. Act as a humanized, conversational, and warm presales lead qualifier. Analyze the chat history context, and reply in a friendly, natural, and empathetic human tone. Keep responses brief.\n` +
    `2. Interactively qualify the lead by checking their temperature. Go through the qualification questions (Goal/Need, Timeline, and Budget/Scale) one by one.\n` +
    `3. Score the lead:\n` +
    `   - If they provide positive and clear answers to all qualification questions: output [TAG: Qualified]\n` +
    `   - If they are highly interested but timeline/budget is pending: output [TAG: Hot]\n` +
    `   - If they have general, mild interest but are slow to commit: output [TAG: Warm]\n` +
    `   - If they show resistance, spam, or no interest: output [TAG: Cold]\n` +
    `4. If they ask for a human, or if you have finished qualifying their needs, explain that you are transferring them and append "[HANDOFF]" to the end of your response.`;

  const instruction = `${systemPrompt}${decorator}`;

  // Format history for Gemini API
  const contents = history.map((msg) => {
    const role = msg.sender_type === 'customer' ? 'user' : 'model'
    return {
      role,
      parts: [{ text: msg.content_text || '' }],
    }
  })

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: {
        parts: [{ text: instruction }],
      },
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.4,
      },
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API error: ${response.status} - ${errText}`)
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function callOpenAI(
  systemPrompt: string,
  history: MessageHistory[],
  apiKey: string
): Promise<string> {
  const decorator = `\n\n[System Instructions]\n` +
    `1. Act as a humanized, conversational, and warm presales lead qualifier. Analyze the chat history context, and reply in a friendly, natural, and empathetic human tone. Keep responses brief.\n` +
    `2. Interactively qualify the lead by checking their temperature. Go through the qualification questions (Goal/Need, Timeline, and Budget/Scale) one by one.\n` +
    `3. Score the lead:\n` +
    `   - If they provide positive and clear answers to all qualification questions: output [TAG: Qualified]\n` +
    `   - If they are highly interested but timeline/budget is pending: output [TAG: Hot]\n` +
    `   - If they have general, mild interest but are slow to commit: output [TAG: Warm]\n` +
    `   - If they show resistance, spam, or no interest: output [TAG: Cold]\n` +
    `4. If they ask for a human, or if you have finished qualifying their needs, explain that you are transferring them and append "[HANDOFF]" to the end of your response.`;

  const messages = [
    {
      role: 'system',
      content: `${systemPrompt}${decorator}`,
    },
    ...history.map((msg) => ({
      role: msg.sender_type === 'customer' ? 'user' : 'assistant',
      content: msg.content_text || '',
    })),
  ]

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 500,
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`OpenAI API error: ${response.status} - ${errText}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}
