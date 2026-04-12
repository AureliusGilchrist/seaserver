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
    <div className="rounded-xl bg-gradient-to-br from-blue-900/60 to-gray-900/80 shadow-lg overflow-hidden mb-4">
      {anilistProfile.banner && (
        <div className="h-32 w-full bg-cover bg-center" style={{ backgroundImage: `url(${anilistProfile.banner})` }} />
      )}
      <div className="flex items-center gap-4 px-6 py-4">
        <img
          src={anilistProfile.avatar}
          alt={anilistProfile.name || "AniList Avatar"}
          className="w-20 h-20 rounded-full border-4 border-white shadow-lg -mt-16 bg-white object-cover"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{anilistProfile.name}</span>
          </div>
          {anilistProfile.bio && (
            <p className="text-[--muted] text-base mt-1 whitespace-pre-line max-w-2xl">
              {anilistProfile.bio}
            </p>
          )}
        </div>
      </div>
      {/* TODO: Render actual activity feed here when available */}
    </div>
  )
}
