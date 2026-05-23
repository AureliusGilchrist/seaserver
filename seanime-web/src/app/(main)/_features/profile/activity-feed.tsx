import * as React from "react"
import { cn } from "@/components/ui/core/styling"
import { LuUser } from "react-icons/lu"

export function ActivityFeed({ anilistProfile }: { anilistProfile?: { avatar?: string; banner?: string; bio?: string; name?: string } }) {
  if (!anilistProfile?.name) {
    return null
  }

  return (
    <div className="relative rounded-xl overflow-hidden border border-[--border] bg-[--paper] mb-4">
      {/* Banner */}
      {anilistProfile.banner && (
        <div
          className="w-full h-20 bg-cover bg-center"
          style={{ backgroundImage: `url(${anilistProfile.banner})` }}
        />
      )}
      <div className={cn("flex items-center gap-3 p-4", anilistProfile.banner && "-mt-6 pt-0")}>
        {/* Avatar */}
        {anilistProfile.avatar ? (
          <img
            src={anilistProfile.avatar}
            alt={anilistProfile.name}
            className={cn(
              "w-12 h-12 rounded-full object-cover border-2 border-[--background] shrink-0",
              anilistProfile.banner && "ring-2 ring-[--background]",
            )}
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-[--subtle] flex items-center justify-center shrink-0 border-2 border-[--background]">
            <LuUser className="w-5 h-5 text-[--muted]" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{anilistProfile.name}</p>
        </div>
      </div>
    </div>
  )
}
