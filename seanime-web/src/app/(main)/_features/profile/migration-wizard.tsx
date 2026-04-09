import { useRunMigration, useSkipMigration } from "@/api/hooks/profiles.hooks"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ProgressBar } from "@/components/ui/progress-bar"
import React from "react"
import { BiData, BiSkipNext } from "react-icons/bi"

type MigrationWizardProps = {
    onComplete: () => void
}

export function MigrationWizard({ onComplete }: MigrationWizardProps) {
    const [step, setStep] = React.useState<"intro" | "form" | "running" | "done">("intro")
    const [profileName, setProfileName] = React.useState("")
    const [pin, setPin] = React.useState("")
    const [progress, setProgress] = React.useState(0)
    const [currentStep, setCurrentStep] = React.useState("")
    const [error, setError] = React.useState("")

    const { mutate: runMigration, isPending: isRunning } = useRunMigration()
    const { mutate: skipMigration, isPending: isSkipping } = useSkipMigration()

    const handleSkip = () => {
        skipMigration(undefined, {
            onSuccess: () => onComplete(),
            onError: (err) => setError(String(err)),
        })
    }

    const handleStartMigration = () => {
        if (!profileName.trim()) return
        setStep("running")
        setProgress(0)
        setCurrentStep("Starting migration...")

        runMigration(
            { profileName: profileName.trim(), pin },
            {
                onSuccess: (data) => {
                    setProgress(100)
                    setCurrentStep("Complete!")
                    setStep("done")
                },
                onError: (err) => {
                    setError(String(err?.response?.data?.error || err?.message || "Migration failed"))
                    setStep("form")
                },
            },
        )
    }

    // Intro screen
    if (step === "intro") {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-[--background]">
                <div className="mb-8">
                    <img src="/seanime-logo.png" alt="logo" className="w-14 h-auto" />
                </div>
                <Card className="max-w-lg w-full p-8">
                    <div className="flex flex-col items-center gap-6 text-center">
                        <div className="w-16 h-16 rounded-full bg-[--brand]/10 flex items-center justify-center">
                            <BiData className="text-3xl text-[--brand]" />
                        </div>
                        <h2 className="text-xl font-bold text-[--foreground]">Multi-Profile Upgrade</h2>
                        <p className="text-sm text-[--muted]">
                            Your installation will be upgraded to support multiple profiles.
                            Your existing data (library, settings, cache) will be migrated
                            to your admin profile.
                        </p>
                        <div className="flex gap-3 w-full">
                            <Button
                                intent="gray"
                                className="flex-1"
                                leftIcon={<BiSkipNext />}
                                onClick={handleSkip}
                                loading={isSkipping}
                            >
                                Fresh Start
                            </Button>
                            <Button
                                intent="primary"
                                className="flex-1"
                                onClick={() => setStep("form")}
                            >
                                Migrate Data
                            </Button>
                        </div>
                        <p className="text-xs text-[--muted]">
                            "Fresh Start" skips migration and creates a blank profile system.
                        </p>
                    </div>
                </Card>
            </div>
        )
    }

    // Form to enter profile name and PIN
    if (step === "form") {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-[--background]">
                <div className="mb-8">
                    <img src="/seanime-logo.png" alt="logo" className="w-14 h-auto" />
                </div>
                <Card className="max-w-lg w-full p-8">
                    <div className="flex flex-col gap-6">
                        <h2 className="text-xl font-bold text-[--foreground] text-center">Create Admin Profile</h2>
                        <p className="text-sm text-[--muted] text-center">
                            Your existing data will be migrated to this profile.
                        </p>
                        {error && (
                            <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                {error}
                            </div>
                        )}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[--foreground] mb-1.5">
                                    Profile Name
                                </label>
                                <input
                                    type="text"
                                    value={profileName}
                                    onChange={(e) => setProfileName(e.target.value)}
                                    placeholder="e.g., Admin"
                                    className="w-full px-3 py-2 rounded-md border border-[--border] bg-[--paper] text-[--foreground] focus:border-[--brand] focus:outline-none"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[--foreground] mb-1.5">
                                    PIN (4-6 digits)
                                </label>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={6}
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                                    placeholder="••••"
                                    className="w-full px-3 py-2 rounded-md border border-[--border] bg-[--paper] text-[--foreground] focus:border-[--brand] focus:outline-none"
                                />
                                <p className="text-xs text-[--muted] mt-1">Optional. Protects profile access.</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Button intent="gray" className="flex-1" onClick={() => setStep("intro")}>
                                Back
                            </Button>
                            <Button
                                intent="primary"
                                className="flex-1"
                                onClick={handleStartMigration}
                                disabled={!profileName.trim()}
                                loading={isRunning}
                            >
                                Start Migration
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>
        )
    }

    // Running migration
    if (step === "running") {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-[--background]">
                <div className="mb-8">
                    <img src="/seanime-logo.png" alt="logo" className="w-14 h-auto" />
                </div>
                <Card className="max-w-lg w-full p-8">
                    <div className="flex flex-col items-center gap-6">
                        <h2 className="text-xl font-bold text-[--foreground]">Migrating Data...</h2>
                        <p className="text-sm text-[--muted]">{currentStep || "Please wait..."}</p>
                        <ProgressBar value={progress} size="md" isIndeterminate className="w-full" />
                        <p className="text-xs text-[--muted]">Do not close this page.</p>
                    </div>
                </Card>
            </div>
        )
    }

    // Done
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[--background]">
            <div className="mb-8">
                <img src="/seanime-logo.png" alt="logo" className="w-14 h-auto" />
            </div>
            <Card className="max-w-lg w-full p-8">
                <div className="flex flex-col items-center gap-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                        <span className="text-3xl">✓</span>
                    </div>
                    <h2 className="text-xl font-bold text-[--foreground]">Migration Complete</h2>
                    <p className="text-sm text-[--muted]">
                        Your data has been migrated to your admin profile. You can now set up additional profiles.
                    </p>
                    <Button intent="primary" onClick={onComplete}>
                        Continue
                    </Button>
                </div>
            </Card>
        </div>
    )
}
