import * as React from "react"

export function ShowcaseCard({ entry, editable }: { entry?: any; editable?: boolean }) {
  // Placeholder: Render a badge or edit button
  if (editable) {
    return <div className="rounded-lg bg-gray-800/60 border border-dashed border-blue-400 flex items-center justify-center h-24">Edit Showcase</div>
  }
  if (!entry) return null
  return (
    <div className="rounded-lg bg-gradient-to-br from-blue-800/40 to-gray-900/60 shadow flex flex-col items-center justify-center h-24 p-2">
      <div className="w-10 h-10 rounded-full bg-blue-400/30 flex items-center justify-center mb-1">
        {/* TODO: Render badge icon */}
        <span className="text-2xl">🏅</span>
      </div>
      <div className="text-xs text-center font-semibold mt-1">{entry.name || "Badge"}</div>
    </div>
  )
}

export function RecentAchievementRow({ entry }: { entry: any }) {
  if (!entry) return null
  return (
    <div className="flex flex-col items-center min-w-[90px] bg-gray-800/60 rounded-lg p-2 shadow">
      <div className="w-8 h-8 rounded-full bg-yellow-400/30 flex items-center justify-center mb-1">
        {/* TODO: Render achievement icon */}
        <span className="text-lg">🏆</span>
      </div>
      <div className="text-xs text-center font-semibold mt-1 truncate max-w-[70px]">{entry.name || "Achievement"}</div>
      {entry.unlockedAt && <div className="text-[10px] text-[--muted] mt-0.5">{new Date(entry.unlockedAt).toLocaleDateString()}</div>}
    </div>
  )
}
