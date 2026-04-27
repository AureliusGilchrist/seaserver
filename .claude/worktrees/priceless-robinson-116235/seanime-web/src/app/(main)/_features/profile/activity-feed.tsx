import * as React from "react"
import { cn } from "@/components/ui/core/styling"

export function ActivityFeed({ anilistProfile }: { anilistProfile?: { avatar?: string; banner?: string; bio?: string; name?: string } }) {
  if (!anilistProfile) {
    return null
  }
  return null
}
