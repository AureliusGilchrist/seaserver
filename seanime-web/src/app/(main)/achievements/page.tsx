"use client"

import { useGetAchievements, useResetAchievements } from "@/api/hooks/achievement.hooks"
import { AchievementsView } from "@/app/(main)/_features/achievement/achievements-view"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import React from "react"
import { toast } from "sonner"

export default function Page() {
    const { data, isLoading } = useGetAchievements()

    const { mutate: resetAchievements, isPending: isResetting } = useResetAchievements()
    const confirmReset = useConfirmationDialog({
        title: "Reset achievements?",
        description: "Every unlock, its progress, your XP and your showcase go back to zero for this profile. What you've watched and read here still counts, so achievements it supports unlock again as you go.",
        actionText: "Reset",
        actionIntent: "alert",
        onConfirm: () => resetAchievements(undefined, {
            onSuccess: () => toast.success("Achievements reset"),
        }),
    })

    return (
        <>
            <CustomLibraryBanner discrete />
            <PageWrapper className="p-4 sm:p-8">
                {isLoading ? (
                    <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>
                ) : data ? (
                    <AchievementsView data={data} variant="page" own onReset={confirmReset.open} resetting={isResetting} />
                ) : null}
                <ConfirmationDialog {...confirmReset} />
            </PageWrapper>
        </>
    )
}
