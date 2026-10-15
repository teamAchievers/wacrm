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

    if (!conversationId || typeof conversationId !== 'string') {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 })
    }

    const trimmedConvId = conversationId.trim()
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

    // 2. Fetch conversation by primary key ID first
    const { data: conv, error: convErr } = await admin
      .from('conversations')
      .select('*')
      .eq('id', trimmedConvId)
      .maybeSingle()

    if (convErr) {
      console.error('[fetch-ad] error querying conversation:', convErr)
      return NextResponse.json(
        { error: `Database error: ${convErr.message}` },
        { status: 500 }
      )
    }

    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Authorization check: user must either own the conversation directly or belong to the same account
    const isOwner = conv.user_id === user.id
    const isAccountMatch = Boolean(accountId && conv.account_id && conv.account_id === accountId)
    if (!isOwner && !isAccountMatch) {
      return NextResponse.json(
        { error: 'Access denied: conversation does not belong to your account' },
        { status: 403 }
      )
    }

    // If conversation was missing account_id but user profile has one, backfill it
    if (!conv.account_id && accountId) {
      await admin
        .from('conversations')
        .update({ account_id: accountId })
        .eq('id', conv.id)
        .catch((err: unknown) => {
          console.warn('[fetch-ad] warning backfilling account_id:', err)
        })
    }

    // 3. Determine target Ad ID and existing referral data
    let existingReferral: ReferralData = (conv.referral_data as ReferralData) || {}
    let targetAdId: string | undefined =
      adId?.trim() || existingReferral.ad_id || existingReferral.source_id

    // If no ad ID yet, check if any message in this conversation has referral_data
    if (!targetAdId) {
      const { data: msgWithRef } = await admin
        .from('messages')
        .select('referral_data')
        .eq('conversation_id', trimmedConvId)
        .not('referral_data', 'is', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (msgWithRef?.referral_data) {
        existingReferral = { ...existingReferral, ...(msgWithRef.referral_data as ReferralData) }
        targetAdId = existingReferral.ad_id || existingReferral.source_id
      }
    }

    // If still no ad ID, search any sibling conversation for the same contact
    if (!targetAdId && conv.contact_id) {
      // 1. Check if any sibling conversation has referral_data with an Ad ID
      const { data: convWithRef } = await admin
        .from('conversations')
        .select('referral_data')
        .eq('contact_id', conv.contact_id)
        .not('referral_data', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (convWithRef?.referral_data) {
        existingReferral = { ...existingReferral, ...(convWithRef.referral_data as ReferralData) }
        targetAdId = existingReferral.ad_id || existingReferral.source_id
      }

      // 2. Also check messages across all conversations for this contact
      if (!targetAdId) {
        const { data: contactConvs } = await admin
          .from('conversations')
          .select('id')
          .eq('contact_id', conv.contact_id)

        if (contactConvs && contactConvs.length > 0) {
          const convIds = contactConvs.map((c: { id: string }) => c.id)
          const { data: msgWithRef } = await admin
            .from('messages')
            .select('referral_data')
            .in('conversation_id', convIds)
            .not('referral_data', 'is', null)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()

          if (msgWithRef?.referral_data) {
            existingReferral = { ...existingReferral, ...(msgWithRef.referral_data as ReferralData) }
            targetAdId = existingReferral.ad_id || existingReferral.source_id
          }
        }
      }

      // 3. Also check if the contact has duplicate contact records by phone number
      if (!targetAdId) {
        const { data: contactRow } = await admin
          .from('contacts')
          .select('phone')
          .eq('id', conv.contact_id)
          .maybeSingle()

        if (contactRow?.phone) {
          const last8 = contactRow.phone.replace(/\D/g, '').slice(-8)
          if (last8) {
            const { data: duplicateContacts } = await admin
              .from('contacts')
              .select('id')
              .ilike('phone', `%${last8}`)

            if (duplicateContacts && duplicateContacts.length > 0) {
              const dupContactIds = duplicateContacts.map((c: { id: string }) => c.id)
              const { data: dupConvWithRef } = await admin
                .from('conversations')
                .select('referral_data')
                .in('contact_id', dupContactIds)
                .not('referral_data', 'is', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

              if (dupConvWithRef?.referral_data) {
                existingReferral = { ...existingReferral, ...(dupConvWithRef.referral_data as ReferralData) }
                targetAdId = existingReferral.ad_id || existingReferral.source_id
              }
            }
          }
        }
      }
    }

    // If we inherited existingReferral from a sibling conversation or message, save it to this conversation
    if (existingReferral && Object.keys(existingReferral).length > 0 && !conv.referral_data) {
      await admin
        .from('conversations')
        .update({ referral_data: existingReferral })
        .eq('id', conv.id)
    }

    // If still no ad ID, return inherited attribution if available or informative status prompting user
    if (!targetAdId) {
      if (existingReferral && Object.keys(existingReferral).length > 0) {
        return NextResponse.json({
          success: true,
          message: 'Inherited chat source from previous conversation',
          referral_data: existingReferral,
        })
      }
      return NextResponse.json({
        success: false,
        no_ad_id: true,
        message: 'No Meta Ad ID associated with this chat yet. Enter an Ad ID or edit attribution manually.',
        referral_data: existingReferral,
      })
    }

    // 4. Fetch WhatsApp config to get access token for Meta Graph API
    let configQuery = admin.from('whatsapp_config').select('*')
    if (accountId) {
      configQuery = configQuery.or(`account_id.eq.${accountId},user_id.eq.${user.id}`)
    } else {
      configQuery = configQuery.eq('user_id', user.id)
    }

    const { data: config, error: configError } = await configQuery.limit(1).maybeSingle()

    if (configError || !config) {
      return NextResponse.json(
        { error: 'WhatsApp is not configured. Please connect WhatsApp in Settings.' },
        { status: 400 }
      )
    }

    let accessToken: string
    try {
      accessToken = decrypt(config.access_token)
    } catch (decryptErr) {
      console.error('[fetch-ad] failed to decrypt access_token:', decryptErr)
      return NextResponse.json(
        { error: 'WhatsApp access token could not be decrypted. Please reconnect in Settings.' },
        { status: 400 }
      )
    }

    // 5. Query Meta Graph API for ad details
    const adDetails = await getAdDetails({ adId: targetAdId, accessToken })

    if (!adDetails) {
      return NextResponse.json({
        success: false,
        message: `Could not fetch ad details from Meta for Ad ID: ${targetAdId}. Verify that the Ad ID is correct and that your Meta system user / token has ads_read permission.`,
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

    // 7. Update conversation row and propagate to any other chats for this contact
    const { error: updateError } = await admin
      .from('conversations')
      .update({ referral_data: updatedReferral })
      .eq('id', conv.id)

    if (updateError) {
      console.error('[fetch-ad] failed to update conversation referral_data:', updateError)
      return NextResponse.json(
        { error: 'Failed to update conversation referral data: ' + updateError.message },
        { status: 500 }
      )
    }

    if (conv.contact_id) {
      await admin
        .from('conversations')
        .update({ referral_data: updatedReferral })
        .eq('contact_id', conv.contact_id)
        .neq('id', conv.id)
        .catch(() => {})
    }

    return NextResponse.json({
      success: true,
      message: 'Ad details successfully fetched from Meta',
      referral_data: updatedReferral,
    })
  } catch (err) {
    console.error('[fetch-ad] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
