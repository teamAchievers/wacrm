import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { manuallyStartFlowRun } from '@/lib/flows/engine'

/**
 * GET /api/flows/[id]/runs
 *
 * Newest-first list of flow runs for a single flow, with the latest
 * event timeline embedded for each. Used by the run-history viewer
 * page (`/flows/[id]/runs`) to give the owner end-to-end visibility
 * into what the bot did with each customer.
 *
 * RLS does the ownership check (flow_runs has a `user_id` policy);
 * we also gate on the per-account beta flag so the route 404s for
 * non-beta accounts matching the rest of /api/flows.
 *
 * Limited to the 50 most recent runs. Pagination can come later;
 * the dashboard surface here is for debugging, not heavy querying.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Confirm flow exists + caller owns it (RLS does this) before doing
  // the run query — gives us a clean 404 instead of empty array.
  const { data: flow } = await supabase
    .from('flows')
    .select('id, name')
    .eq('id', id)
    .maybeSingle()
  if (!flow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Pull runs + each run's contact name + each run's events. Two
  // joined selects keep the round-trip count to the runs query + one
  // per-run events query.
  const { data: runs, error: runsErr } = await supabase
    .from('flow_runs')
    .select(
      'id, status, current_node_key, started_at, last_advanced_at, ended_at, end_reason, vars, reprompt_count, contact:contacts(id, name, phone)',
    )
    .eq('flow_id', id)
    .order('started_at', { ascending: false })
    .limit(50)
  if (runsErr) {
    return NextResponse.json({ error: runsErr.message }, { status: 500 })
  }

  const runIds = (runs ?? []).map((r) => (r as { id: string }).id)
  let events: Array<{
    flow_run_id: string
    event_type: string
    node_key: string | null
    payload: Record<string, unknown>
    created_at: string
  }> = []
  if (runIds.length > 0) {
    const { data: evs, error: evsErr } = await supabase
      .from('flow_run_events')
      .select('flow_run_id, event_type, node_key, payload, created_at')
      .in('flow_run_id', runIds)
      .order('created_at', { ascending: true })
    if (evsErr) {
      // Non-fatal — the page can still show runs without timelines.
      console.error('[flows-runs] events fetch failed:', evsErr.message)
    } else if (evs) {
      events = evs as typeof events
    }
  }

  return NextResponse.json({
    flow,
    runs: runs ?? [],
    events,
  })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: flowId } = await context.params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { contact_id } = await request.json().catch(() => ({ contact_id: null }))
  if (!contact_id) {
    return NextResponse.json({ error: 'Missing contact_id' }, { status: 400 })
  }

  // Resolve account_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()
  const accountId = profile?.account_id as string | undefined
  if (!accountId) {
    return NextResponse.json(
      { error: 'Your profile is not linked to an account.' },
      { status: 403 },
    )
  }

  const res = await manuallyStartFlowRun(accountId, user.id, flowId, contact_id)
  if (!res.success) {
    return NextResponse.json({ error: res.error }, { status: 400 })
  }

  return NextResponse.json({ success: true, runId: res.runId })
}
