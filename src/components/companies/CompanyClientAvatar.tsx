import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera } from 'lucide-react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'

function companyInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) {
    const w = parts[0]!
    return w.length >= 2 ? w.slice(0, 2).toUpperCase() : (w[0]! + w[0]!).toUpperCase()
  }
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

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
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    setImgFailed(false)
  }, [avatarUrl])

  const showImage = Boolean(avatarUrl?.trim()) && !imgFailed

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
      setImgFailed(false)
      success('Client logo updated')
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
        title="Upload client logo"
        className="group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9b3e20] focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf8f5] disabled:opacity-60 dark:focus-visible:ring-orange-400 dark:focus-visible:ring-offset-stone-900"
      >
        <span
          className="ring-stitch-on-surface/15 flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-stone-300 bg-stone-100 text-lg font-semibold tracking-tight text-stone-600 shadow-sm ring-2 ring-white transition group-hover:border-stone-400 group-hover:bg-stone-200/90 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-900 dark:group-hover:border-stone-500 dark:group-hover:bg-stone-700/90"
        >
          {showImage ? (
            <img
              src={avatarUrl!.trim()}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span aria-hidden>{companyInitials(companyName)}</span>
          )}
        </span>
        <span
          className="border-line absolute -right-0.5 -bottom-0.5 flex h-7 w-7 items-center justify-center rounded-full border bg-white shadow-md dark:border-stone-600 dark:bg-stone-900"
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
