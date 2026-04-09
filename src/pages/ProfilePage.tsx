import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { useToast } from '@/hooks/useToast'
import { ScreenHeader } from '@/components/layout/ScreenHeader'

function slugFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext
  return 'jpg'
}

export function ProfilePage() {
  const { user } = useAuth()
  const { success, error: toastError } = useToast()
  const supabase = getSupabase()
  const fileRef = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState(() => (user?.user_metadata?.full_name as string | undefined) ?? '')
  const [saving, setSaving] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const email = user?.email ?? ''
  const name = (user?.user_metadata?.full_name as string | undefined) ?? ''
  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) ?? null

  useEffect(() => {
    setDisplayName((user?.user_metadata?.full_name as string | undefined) ?? '')
  }, [user?.user_metadata?.full_name])

  async function saveName() {
    if (!supabase) return
    setSaving(true)
    const { error } = await supabase.auth.updateUser({
      data: { full_name: displayName.trim() || undefined },
    })
    setSaving(false)
    if (error) {
      toastError(error.message)
      return
    }
    success('Profile updated')
    setEditOpen(false)
  }

  async function onPickAvatar(file: File | null) {
    if (!file || !supabase || !user) return
    if (!file.type.startsWith('image/')) {
      toastError('Please choose an image file.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toastError('Image must be 2 MB or smaller.')
      return
    }
    setUploadingAvatar(true)
    const ext = slugFromFilename(file.name)
    const path = `${user.id}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })
    if (upErr) {
      setUploadingAvatar(false)
      toastError(upErr.message)
      return
    }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    const publicUrl = pub.publicUrl
    const { error: metaErr } = await supabase.auth.updateUser({
      data: { avatar_url: publicUrl },
    })
    setUploadingAvatar(false)
    if (metaErr) {
      toastError(metaErr.message)
      return
    }
    success('Avatar updated')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="flex flex-col gap-8">
      <ScreenHeader title="Profile & avatar" subtitle="Your account, photo, and display name across the app." backTo="/settings" />

      <section className="border-line from-accent-soft/40 bg-gradient-to-br to-transparent dark:from-stone-800/60 relative overflow-hidden rounded-3xl border p-8 dark:border-line-dark">
        <div className="pointer-events-none absolute -right-8 -bottom-8 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl dark:bg-amber-500/10" />
        <div className="relative flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-3">
            <UserAvatar email={email} name={name} avatarUrl={avatarUrl} size="lg" className="ring-4 ring-white/50 shadow-xl dark:ring-stone-700/50" />
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={(e) => void onPickAvatar(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              disabled={uploadingAvatar || !supabase}
              onClick={() => fileRef.current?.click()}
              className="border-line bg-white/90 text-ink hover:bg-white rounded-full border px-4 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-60 dark:border-line-dark dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700"
            >
              {uploadingAvatar ? 'Uploading…' : 'Change avatar'}
            </button>
            <p className="text-ink-muted max-w-[14rem] text-center text-xs">JPEG, PNG, WebP or GIF · max 2 MB</p>
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="font-display text-xl font-semibold">{name || email.split('@')[0] || 'You'}</p>
            <p className="text-ink-muted text-sm">{email}</p>
            <button
              type="button"
              onClick={() => {
                setDisplayName((user?.user_metadata?.full_name as string | undefined) ?? '')
                setEditOpen(true)
              }}
              className="bg-accent text-stone-50 hover:bg-accent/90 mt-4 rounded-full px-5 py-2 text-sm font-semibold shadow-md transition hover:shadow-lg"
            >
              Edit display name
            </button>
          </div>
        </div>
      </section>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Display name" size="sm">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Name
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="border-line bg-white/90 focus:ring-accent rounded-xl border px-3 py-2.5 outline-none focus:ring-2 dark:border-line-dark dark:bg-stone-900/80"
            placeholder="How we greet you in the header"
            autoFocus
          />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditOpen(false)}
            className="border-line rounded-full border px-4 py-2 text-sm font-medium dark:border-line-dark"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveName()}
            className="bg-accent text-stone-50 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
