import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Resolve account id
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .single()

    if (profileErr || !profile?.account_id) {
      return NextResponse.json({ error: 'No account linked' }, { status: 400 })
    }

    const { data: config, error: configErr } = await supabase
      .from('chatbot_config')
      .select('*')
      .eq('account_id', profile.account_id)
      .maybeSingle()

    if (configErr) {
      console.error('Error fetching chatbot_config:', configErr)
      return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 })
    }

    if (!config) {
      return NextResponse.json({
        is_enabled: false,
        provider: 'gemini',
        system_prompt: 'You are a helpful business assistant. Ask the customer about their goals and business scale to qualify them as a lead before transferring to our sales team.',
        handoff_keywords: 'human, agent, representative, help, support, talk to a person',
        has_key: false,
      })
    }

    return NextResponse.json({
      is_enabled: config.is_enabled,
      provider: config.provider,
      system_prompt: config.system_prompt,
      handoff_keywords: config.handoff_keywords,
      has_key: !!config.api_key,
    })
  } catch (error) {
    console.error('Error in chatbot config GET:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Resolve account id
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .single()

    if (profileErr || !profile?.account_id) {
      return NextResponse.json({ error: 'No account linked' }, { status: 400 })
    }

    const body = await request.json()
    const { is_enabled, provider, api_key, system_prompt, handoff_keywords } = body

    // Validate inputs
    if (provider !== 'gemini' && provider !== 'openai') {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    // Load existing config to see if we should retain the API key
    const { data: existingConfig } = await supabase
      .from('chatbot_config')
      .select('api_key')
      .eq('account_id', profile.account_id)
      .maybeSingle()

    let encryptedKey = existingConfig?.api_key || null
    if (api_key) {
      encryptedKey = encrypt(api_key)
    }

    const { error: upsertErr } = await supabase.from('chatbot_config').upsert(
      {
        account_id: profile.account_id,
        is_enabled: !!is_enabled,
        provider,
        api_key: encryptedKey,
        system_prompt: system_prompt || 'You are a helpful business assistant.',
        handoff_keywords: handoff_keywords || '',
      },
      { onConflict: 'account_id' }
    )

    if (upsertErr) {
      console.error('Error saving chatbot config:', upsertErr)
      return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in chatbot config POST:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
