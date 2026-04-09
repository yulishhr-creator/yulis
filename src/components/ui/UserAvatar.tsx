import { clsx } from 'clsx'
import { useEffect, useState } from 'react'

type UserAvatarProps = {
  email?: string | null
  name?: string | null
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

function initials(email: string | null | undefined, name: string | null | undefined): string {
  const n = name?.trim()
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
    return n.slice(0, 2).toUpperCase()
  }
  const e = email?.trim()
  if (e) return e.slice(0, 2).toUpperCase()
  return '?'
}

const dim = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg' } as const

export function UserAvatar({ email, name, avatarUrl, size = 'md', className }: UserAvatarProps) {
  const letter = initials(email, name)
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    setImgFailed(false)
  }, [avatarUrl])

  const showImage = Boolean(avatarUrl?.trim()) && !imgFailed

  if (showImage) {
    return (
      <span
        className={clsx(
          'ring-accent-soft/80 flex shrink-0 overflow-hidden rounded-full bg-stone-200 ring-2 dark:bg-stone-700 dark:ring-stone-600',
          dim[size],
          className,
        )}
      >
        <img
          src={avatarUrl!.trim()}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      </span>
    )
  }

  return (
    <span
      className={clsx(
        'ring-accent-soft/80 text-stone-50 flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-accent)] to-amber-900 font-semibold shadow-inner ring-2 dark:to-amber-950 dark:ring-stone-600',
        dim[size],
        className,
      )}
      aria-hidden
    >
      {letter}
    </span>
  )
}
