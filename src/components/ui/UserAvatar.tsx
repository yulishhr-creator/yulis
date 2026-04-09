import { clsx } from 'clsx'
import { useEffect, useState } from 'react'

type UserAvatarProps = {
  email?: string | null
  name?: string | null
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const dim = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg' } as const

export function UserAvatar({ avatarUrl, size = 'md', className }: UserAvatarProps) {
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
        'ring-accent-soft/80 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-inner ring-2 dark:bg-stone-900 dark:ring-stone-600',
        dim[size],
        className,
      )}
      aria-hidden
    >
      <img src="/yuli-default-avatar.png" alt="" className="h-full w-full object-cover object-top" />
    </span>
  )
}
