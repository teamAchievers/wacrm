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

  // 6. Process AI response for handoff triggers
  if (replyText.includes('[HANDOFF]') || replyText.trim() === 'HANDOFF') {
    await triggerHandoff(accountId, conversationId, contactId, ownerId)
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
  ownerId: string
): Promise<void> {
  const db = supabaseAdmin()

  // Assign to owner and disable chatbot for this chat
  await db
    .from('conversations')
    .update({ assigned_agent_id: ownerId, chatbot_enabled: false })
    .eq('id', conversationId)

  // Send human handoff notice
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
    `2. Interactively qualify the lead by asking questions one at a time (e.g., understanding their problem, budget, or timeline).\n` +
    `3. If they ask for a human, or if you have finished qualifying their needs, explain that you are transferring them and append "[HANDOFF]" to the end of your response.`;

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
    `2. Interactively qualify the lead by asking questions one at a time (e.g., understanding their problem, budget, or timeline).\n` +
    `3. If they ask for a human, or if you have finished qualifying their needs, explain that you are transferring them and append "[HANDOFF]" to the end of your response.`;

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
