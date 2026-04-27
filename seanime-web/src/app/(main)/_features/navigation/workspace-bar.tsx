"use client"
import React from "react"
import { useGetProfiles, useProfileLogin } from "@/api/hooks/profiles.hooks"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { cn } from "@/components/ui/core/styling"
import { Avatar } from "@/components/ui/avatar"

export const WORKSPACE_BAR_HEIGHT = "2rem" // 32px — matches h-8 below

export function WorkspaceBar() {
    const { data: profiles } = useGetProfiles(true)
    const serverStatus = useServerStatus()
    const currentProfileId = serverStatus?.currentProfile?.id

    if (!profiles || profiles.length <= 1) return null

    return (
        <div
            className="fixed top-0 left-0 right-0 z-[200] flex items-center gap-1 px-2 bg-[--paper]/90 border-b border-[--border] backdrop-blur-sm"
            style={{ height: WORKSPACE_BAR_HEIGHT }}
        >
            <span className="text-[10px] text-[--muted] mr-1 shrink-0">Profiles:</span>
            {profiles.map((profile) => {
                const isActive = profile.id === currentProfileId
                return (
                    <WorkspaceProfileChip
                        key={profile.id}
                        profile={profile}
                        isActive={isActive}
                    />
                )
            })}
        </div>
    )
}

function WorkspaceProfileChip({ profile, isActive }: { profile: any; isActive: boolean }) {
    return (
        <div
            className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors select-none",
                isActive
                    ? "bg-[--color-brand-500]/20 text-[--color-brand-300] border border-[--color-brand-500]/30"
                    : "text-[--muted] border border-transparent",
            )}
        >
            <Avatar
                src={profile.avatarPath || profile.anilistAvatar || undefined}
                fallback={profile.name.charAt(0).toUpperCase()}
                className="w-3.5 h-3.5 text-[8px]"
            />
            <span className="max-w-[80px] truncate">{profile.name}</span>
            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[--color-brand-400] shrink-0" />}
        </div>
    )
}
