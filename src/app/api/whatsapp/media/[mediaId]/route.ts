import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getMediaUrl, downloadMedia } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'

// Lazy-initialized admin client to bypass RLS when querying whatsapp_config and caching to storage
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const rawMediaId = (await params)?.mediaId
    const cleanMediaId = rawMediaId ? rawMediaId.split('.')[0].split('?')[0] : ''

    if (!cleanMediaId) {
      return NextResponse.json(
        { error: 'Media ID is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const admin = supabaseAdmin()

    // Resolve the caller's account_id via profiles or account_members
    const { data: profile } = await admin
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()

    let accountId = profile?.account_id as string | undefined
    if (!accountId) {
      const { data: member } = await admin
        .from('account_members')
        .select('account_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()
      accountId = member?.account_id as string | undefined
    }

    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const storagePath = `account-${accountId}/inbound-${cleanMediaId}`

    // 1. Check if media was already cached in Supabase Storage
    try {
      const { data: cachedBlob, error: downloadErr } = await admin
        .storage
        .from('chat-media')
        .download(storagePath)

      if (!downloadErr && cachedBlob) {
        const arrayBuffer = await cachedBlob.arrayBuffer()
        return new Response(new Uint8Array(arrayBuffer), {
          status: 200,
          headers: {
            'Content-Type': cachedBlob.type || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      }
    } catch {
      // Storage cache miss or storage unconfigured — continue to Meta fetch
    }

    // 2. Fetch and decrypt WhatsApp config via admin client (scoped to user's verified accountId)
    const { data: config, error: configError } = await admin
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()

    if (configError || !config) {
      return NextResponse.json(
        { error: 'WhatsApp not configured' },
        { status: 400 }
      )
    }

    const accessToken = decrypt(config.access_token)

    // 3. Get the download URL from Meta
    const mediaInfo = await getMediaUrl({ mediaId: cleanMediaId, accessToken })

    // 4. Download the binary data
    const { buffer, contentType } = await downloadMedia({
      downloadUrl: mediaInfo.url,
      accessToken,
    })

    const finalContentType = contentType || mediaInfo.mimeType || 'application/octet-stream'

    // 5. Cache the downloaded file to chat-media storage bucket asynchronously
    admin
      .storage
      .from('chat-media')
      .upload(storagePath, buffer, {
        contentType: finalContentType,
        upsert: true,
      })
      .catch((err: unknown) => {
        console.warn('[media] failed to cache inbound media to storage:', err)
      })

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': finalContentType,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (error) {
    console.error('Error in WhatsApp media GET:', error)
    const errMsg = error instanceof Error ? error.message : String(error)
    const isExpired =
      errMsg.includes('404') ||
      errMsg.includes('100') ||
      errMsg.includes('expired') ||
      errMsg.includes('Media fetch failed') ||
      errMsg.includes('Media URL not found')

    return NextResponse.json(
      {
        error: isExpired
          ? 'Media has expired on WhatsApp servers (media is stored for ~30 days by Meta)'
          : 'Failed to fetch media',
        expired: isExpired,
      },
      { status: isExpired ? 410 : 500 }
    )
  }
}
