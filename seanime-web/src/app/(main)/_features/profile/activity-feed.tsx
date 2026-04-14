import * as React from "react"
import { cn } from "@/components/ui/core/styling"

export function ActivityFeed({ anilistProfile }: { anilistProfile?: { avatar?: string; banner?: string; bio?: string; name?: string } }) {
  if (!anilistProfile) {
    return (
      <div className="rounded-xl bg-gradient-to-br from-blue-900/60 to-gray-900/80 shadow-lg p-6 flex flex-col items-center justify-center min-h-[180px] mb-4">
        <div className="text-lg text-[--muted]">Connect your AniList account to see your profile and activity feed here.</div>
      </div>
    )
  }
  return (
    <div className="rounded-xl bg-gradient-to-br from-blue-900/60 to-gray-900/80 shadow-lg overflow-hidden mb-4 px-6 py-4">
      {anilistProfile.bio && (
        <p className="text-[--muted] text-base whitespace-pre-line max-w-2xl">
          {anilistProfile.bio}
        </p>
      )}
      {/* TODO: Render actual activity feed here when available */}
    </div>
  )
}
