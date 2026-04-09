import type { SupabaseClient } from '@supabase/supabase-js'

/** One-time demo chain so first login is not empty. Idempotent: skips if any company exists. */
export async function seedDemoIfEmpty(supabase: SupabaseClient, userId: string): Promise<void> {
  const { count, error: cErr } = await supabase
    .from('companies')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null)

  if (cErr || (count ?? 0) > 0) return

  const { data: company, error: coErr } = await supabase
    .from('companies')
    .insert({
      user_id: userId,
      name: 'Demo Tech Ltd',
      description: 'Sample client — replace with a real company.',
      contact_person: 'Alex Recruiter',
      contact_email: 'hr@demo-tech.example',
      contact_phone: '+972-50-0000000',
      website: 'https://example.com',
      payment_terms: ['Net 30', 'Success fee on hire'],
    })
    .select('id')
    .single()

  if (coErr || !company) return

  const { data: position, error: pErr } = await supabase
    .from('positions')
    .insert({
      user_id: userId,
      company_id: company.id,
      title: 'Senior Software Engineer',
      description: 'Demo position — explore stages, candidates, and tasks.',
      requirement_item_values: ['typescript', 'react', 'system_design'],
      industry: 'Software',
      salary_min: 35000,
      salary_max: 45000,
      status: 'in_progress',
      welcome_1: 'Hi — I’m reaching out about an exciting role…',
      planned_fee_ils: 25000,
    })
    .select('id')
    .single()

  if (pErr || !position) return

  const stages = ['Screening', 'Interview']
  const stageIds: string[] = []
  for (let i = 0; i < stages.length; i++) {
    const { data: st } = await supabase
      .from('position_stages')
      .insert({
        user_id: userId,
        position_id: position.id,
        sort_order: i,
        name: stages[i],
      })
      .select('id')
      .single()
    if (st?.id) stageIds.push(st.id)
  }

  const s0 = stageIds[0] ?? null
  const s1 = stageIds[1] ?? s0

  await supabase.from('candidate_import_batches').insert({
    user_id: userId,
    position_id: position.id,
    filename: 'demo-candidates.xlsx',
    row_count: 1,
  })

  const { data: candExt } = await supabase
    .from('candidates')
    .insert({
      user_id: userId,
      position_id: position.id,
      position_stage_id: s0,
      full_name: 'Jamie Rivera',
      email: 'jamie.rivera@example.com',
      phone: '+972501111111',
      source: 'external',
      outcome: 'active',
      email_normalized: 'jamie.rivera@example.com',
      phone_normalized: '972501111111',
      notes: 'Imported from client list (demo).',
      requirement_item_values: ['typescript', 'react'],
    })
    .select('id')
    .single()

  await supabase.from('candidates').insert({
    user_id: userId,
    position_id: position.id,
    position_stage_id: s1,
    full_name: 'Sam Cohen',
    email: 'sam.cohen@example.com',
    phone: '+972502222222',
    source: 'app',
    outcome: 'active',
    email_normalized: 'sam.cohen@example.com',
    phone_normalized: '972502222222',
    notes: 'Added from the app (demo).',
    requirement_item_values: ['system_design'],
  })

  await supabase.from('tasks').insert({
    user_id: userId,
    position_id: position.id,
    candidate_id: candExt?.id ?? null,
    title: 'Get hiring contract signed',
    status: 'todo',
    due_at: new Date(Date.now() + 86400000).toISOString(),
    description: 'Send the contract to the client for this placement.',
  })

  await supabase.from('reminders').insert({
    user_id: userId,
    title: 'Follow up on salary range',
    body: 'Confirm budget band with the hiring manager.',
    due_at: new Date(Date.now() + 2 * 86400000).toISOString(),
    position_id: position.id,
  })

  await supabase.from('email_templates').insert({
    user_id: userId,
    name: 'Intro — candidate',
    subject: 'Update: {{position_title}} — {{candidate_name}}',
    body: 'Hi,\n\nQuick update on {{candidate_name}} for {{position_title}}.\n\nBest,\n{{user_name}}',
  })

  const listKeys = [
    { list_key: 'industry', value: 'software', label: 'Software' },
    { list_key: 'payment_term_preset', value: 'net30', label: 'Net 30' },
    { list_key: 'requirements', value: 'typescript', label: 'TypeScript' },
    { list_key: 'requirements', value: 'react', label: 'React' },
    { list_key: 'requirements', value: 'system_design', label: 'System design' },
  ]
  for (const row of listKeys) {
    await supabase.from('list_items').insert({ user_id: userId, ...row, sort_order: 0 })
  }
}
