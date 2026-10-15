import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getAdDetails } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import type { ReferralData } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
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

    const body = await request.json().catch(() => ({}))
    const { conversationId, adId } = body as { conversationId?: string; adId?: string }

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 })
    }

    const admin = supabaseAdmin()

    // 1. Resolve user's account_id
    const { data: profile } = await admin
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()

    let accountId = (profile as { account_id?: string } | null)?.account_id
    if (!accountId) {
      const { data: member } = await admin
        .from('account_members')
        .select('account_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()
      accountId = (member as { account_id?: string } | null)?.account_id
    }

    if (!accountId) {
      return NextResponse.json({ error: 'Account not resolved' }, { status: 403 })
    }

    // 2. Fetch conversation
    const { data: conv, error: convErr } = await admin
      .from('conversations')
      .select('id, account_id, referral_data')
      .eq('id', conversationId)
      .eq('account_id', accountId)
      .maybeSingle()

    if (convErr || !conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // 3. Determine target Ad ID and existing referral data
    let existingReferral: ReferralData = (conv.referral_data as ReferralData) || {}
    let targetAdId: string | undefined = adId?.trim() || existingReferral.ad_id || existingReferral.source_id

    // If no ad ID yet, check if any message in this conversation has referral_data
    if (!targetAdId) {
      const { data: msgWithRef } = await admin
        .from('messages')
        .select('referral_data')
        .eq('conversation_id', conversationId)
        .not('referral_data', 'is', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (msgWithRef?.referral_data) {
        existingReferral = { ...existingReferral, ...(msgWithRef.referral_data as ReferralData) }
        targetAdId = existingReferral.ad_id || existingReferral.source_id
      }
    }

    // If still no ad ID, return current referral data or notice
    if (!targetAdId) {
      return NextResponse.json({
        success: false,
        message: 'No Ad ID found on this conversation. Please enter an Ad ID to fetch details.',
        referral_data: existingReferral,
      })
    }

    // 4. Fetch WhatsApp config to get access token for Meta Graph API
    const { data: config, error: configError } = await admin
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()

    if (configError || !config) {
      return NextResponse.json({ error: 'WhatsApp is not configured for this account' }, { status: 400 })
    }

    const accessToken = decrypt(config.access_token)

    // 5. Query Meta Graph API for ad details
    const adDetails = await getAdDetails({ adId: targetAdId, accessToken })

    if (!adDetails) {
      // Even if Meta API failed to resolve details (e.g. ad ID doesn't exist or token lacks ads_read permission),
      // we still preserve what we have
      return NextResponse.json({
        success: false,
        message: `Could not fetch ad details from Meta for Ad ID: ${targetAdId}. Verify the Ad ID and that your Meta System User has ads_read permission.`,
        referral_data: existingReferral,
      })
    }

    // 6. Merge ad details into referral_data
    const updatedReferral: ReferralData = {
      ...existingReferral,
      source_type: existingReferral.source_type || 'ad',
      source_id: targetAdId,
      ad_id: adDetails.ad_id || targetAdId,
      ad_name: adDetails.ad_name || existingReferral.ad_name,
      adset_id: adDetails.adset_id || existingReferral.adset_id,
      adset_name: adDetails.adset_name || existingReferral.adset_name,
      campaign_id: adDetails.campaign_id || existingReferral.campaign_id,
      campaign_name: adDetails.campaign_name || existingReferral.campaign_name,
    }

    // 7. Update conversation row
    const { error: updateError } = await admin
      .from('conversations')
      .update({ referral_data: updatedReferral })
      .eq('id', conversationId)

    if (updateError) {
      console.error('[fetch-ad] failed to update conversation referral_data:', updateError)
      return NextResponse.json({ error: 'Failed to update conversation referral data' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Ad details successfully fetched from Meta',
      referral_data: updatedReferral,
    })
  } catch (err) {
    console.error('[fetch-ad] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
