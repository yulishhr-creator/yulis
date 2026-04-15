import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera } from 'lucide-react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { useToast } from '@/hooks/useToast'

type Props = {
  companyId: string
  companyName: string
  avatarUrl: string | null | undefined
}

export function CompanyClientAvatar({ companyId, companyName, avatarUrl }: Props) {
  const { user } = useAuth()
  const supabase = getSupabase()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!supabase || !user?.id) throw new Error('Not signed in')
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const path = `${user.id}/company-${companyId}.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type || 'image/jpeg',
      })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      const publicUrl = `${pub.publicUrl}?t=${Date.now()}`
      const { error } = await supabase
        .from('companies')
        .update({ avatar_url: publicUrl })
        .eq('id', companyId)
        .eq('user_id', user.id)
      if (error) throw error
      return publicUrl
    },
    onSuccess: async () => {
      success('Client avatar updated')
      await qc.invalidateQueries({ queryKey: ['companies'] })
      await qc.invalidateQueries({ queryKey: ['positions'] })
      await qc.invalidateQueries({ queryKey: ['company', companyId] })
    },
    onError: (e: Error) => toastError(e.message),
    onSettled: () => setUploading(false),
  })

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={uploading || !supabase}
        onClick={() => inputRef.current?.click()}
        title="Upload client logo or avatar"
        className="group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9b3e20] focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf8f5] disabled:opacity-60 dark:focus-visible:ring-orange-400 dark:focus-visible:ring-offset-stone-900"
      >
        <UserAvatar
          name={companyName}
          avatarUrl={avatarUrl}
          size="lg"
          className="ring-2 ring-white shadow-md transition group-hover:ring-[#fd8863]/60 dark:ring-stone-700 dark:group-hover:ring-orange-400/50"
        />
        <span
          className="border-line absolute -right-0.5 -bottom-0.5 flex h-7 w-7 items-center justify-center rounded-full border bg-gradient-to-br from-white to-stone-100 shadow-md dark:from-stone-800 dark:to-stone-900 dark:border-stone-600"
          aria-hidden
        >
          <Camera className="text-ink-muted h-3.5 w-3.5 dark:text-stone-400" />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f || !f.type.startsWith('image/')) return
          setUploading(true)
          upload.mutate(f)
        }}
      />
    </div>
  )
}
