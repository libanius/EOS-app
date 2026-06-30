'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Table = 'profiles' | 'family_members' | 'resource_inventory' | 'checklists' | 'circle_members'

/**
 * Subscribe to Supabase Realtime on table changes.
 * Calls onUpdate() on INSERT/UPDATE/DELETE — caller re-fetches.
 */
export function useRealtimeSync(tables: Table[], onUpdate: (table: Table) => void) {
  const cbRef = useRef(onUpdate)
  cbRef.current = onUpdate

  useEffect(() => {
    const supabase = createClient()
    const channels = tables.map(table => {
      return supabase
        .channel(`eos-rt-${table}`)
        .on(
            'postgres_changes',
          { event: '*', schema: 'public', table },
          () => cbRef.current(table),
        )
        .subscribe()
    })
    return () => { channels.forEach(ch => { void supabase.removeChannel(ch) }) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(',')])
}
