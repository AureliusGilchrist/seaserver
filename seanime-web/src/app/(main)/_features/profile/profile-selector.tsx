import { INTERNAL_ProfileSummary as ProfileSummary } from "@/api/generated/types"
import { useProfileLogin } from "@/api/hooks/profiles.hooks"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { ProfileAniListGate } from "../../server-data-wrapper"
import { BiArrowBack, BiCheck, BiPlus } from "react-icons/bi"
import { MdBackspace } from "react-icons/md"

const MAX_PIN_LENGTH = 8
const MIN_PIN_LENGTH = 4

type ProfileLoginError = {
    response?: {
        data?: {
            error?: unknown
            message?: unknown
        }
    }
    message?: unknown
}

function requiresAniListToken(error: unknown): boolean {
    if (!error || typeof error !== "object") return false

    const loginError = error as ProfileLoginError
    const messages = [
        loginError.response?.data?.error,
        loginError.response?.data?.message,
        loginError.message,
    ]
    const message = messages
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLowerCase()

    return message.includes("anilist login required for this profile")
        || message.includes("invalid anilist token")
        || message.includes("could not find anilist user for this token")
}

type ProfileSelectorProps = {
    profiles: ProfileSummary[]
    onManageProfiles?: () => void
}

export function ProfileSelector({ profiles, onManageProfiles }: ProfileSelectorProps) {
    const [selectedProfile, setSelectedProfile] = React.useState<ProfileSummary | null>(null)
    const [pin, setPin] = React.useState("")
    const [pinError, setPinError] = React.useState("")
    const [pressedKey, setPressedKey] = React.useState<string | null>(null)
    const { mutate: login, isPending } = useProfileLogin()
    const [showAniListModal, setShowAniListModal] = React.useState(false)
    const [pendingProfile, setPendingProfile] = React.useState<ProfileSummary | null>(null)
    // Track last login attempt for retry after token
    const lastLoginProfileRef = React.useRef<ProfileSummary | null>(null)
    const lastLoginPinRef = React.useRef<string>("")
    const [aniListModalError, setAniListModalError] = React.useState<string | null>(null)
    const [isSubmittingToken, setIsSubmittingToken] = React.useState(false)

    // Ref keeps the latest pin value so event handlers never see a stale closure
    const pinRef = React.useRef(pin)
    React.useEffect(() => { pinRef.current = pin }, [pin])

    const handleProfileClick = (profile: ProfileSummary) => {
        if (!profile.hasPIN) {
            lastLoginProfileRef.current = profile
            lastLoginPinRef.current = ""
            login(
                { profileId: profile.id, pin: "" },
                {
                    onError: (error: unknown) => {
                        if (requiresAniListToken(error)) {
                            setPendingProfile(profile)
                            setShowAniListModal(true)
                        } else {
                            setPinError("Login failed")
                        }
                    },
                },
            )
            return
        }
        lastLoginProfileRef.current = profile
        lastLoginPinRef.current = pin
        setSelectedProfile(profile)
        setPin("")
        setPinError("")
    }

    const handlePinSubmit = React.useCallback(() => {
        const currentPin = pinRef.current
        if (!selectedProfile || currentPin.length < MIN_PIN_LENGTH) return
        setPinError("")
        lastLoginProfileRef.current = selectedProfile
        lastLoginPinRef.current = currentPin
        login(
            { profileId: selectedProfile.id, pin: currentPin },
            {
                onError: (error: unknown) => {
                    if (requiresAniListToken(error)) {
                        setPendingProfile(selectedProfile)
                        setShowAniListModal(true)
                    } else {
                        setPinError("Incorrect PIN")
                        setPin("")
                    }
                },
            },
        )
    }, [selectedProfile, login])

    const handleBack = () => {
        setSelectedProfile(null)
        setPin("")
        setPinError("")
    }

    const handleKeypadPress = (key: string) => {
        setPressedKey(key)
        setTimeout(() => setPressedKey(null), 150)

        if (key === "backspace") {
            setPin(prev => prev.slice(0, -1))
            setPinError("")
        } else if (key === "submit") {
            handlePinSubmit()
        } else {
            setPin(prev => {
                if (prev.length >= MAX_PIN_LENGTH) return prev
                setPinError("")
                return prev + key
            })
        }
    }

    // Auto-submit when PIN reaches max length (8 digits)
    React.useEffect(() => {
        if (pin.length === MAX_PIN_LENGTH && selectedProfile) {
            handlePinSubmit()
        }
    }, [pin])

    // Keyboard support — handlePinSubmit is stable via useCallback so no stale closure
    React.useEffect(() => {
        if (!selectedProfile) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key >= "0" && e.key <= "9") {
                handleKeypadPress(e.key);
            } else if (e.key === "Backspace") {
                handleKeypadPress("backspace");
            } else if (e.key === "Enter") {
                handlePinSubmit();
            } else if (e.key === "Escape") {
                handleBack();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [selectedProfile, handlePinSubmit]);

    // --- MAIN RENDER ---
    // Show AniList token modal if required
    if (showAniListModal && pendingProfile) {
        return (
            <ProfileAniListGate
                profileName={pendingProfile.name}
                host={window.location.host}
                onManualToken={(token: string) => {
                    setAniListModalError(null)
                    setIsSubmittingToken(true)
                    // Re-call profile login with the AniList token included
                    login(
                        {
                            profileId: pendingProfile.id,
                            pin: lastLoginPinRef.current,
                            anilistToken: token.trim(),
                        },
                        {
                            onSuccess: () => {
                                setIsSubmittingToken(false)
                                // useProfileLogin's onSuccess handles token storage, state update, and query invalidation
                            },
                            onError: (err: any) => {
                                setIsSubmittingToken(false)
                                const msg = err?.response?.data?.message || err?.message || "Invalid or expired AniList token. Please try again."
                                setAniListModalError(msg)
                            },
                        },
                    )
                }}
                formError={aniListModalError}
                isLoading={isSubmittingToken}
            />
        )
    }

    // PIN entry screen with keypad
    if (selectedProfile) {
        return (
            <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#080a16] px-4 py-10 text-white">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_10%,rgba(124,58,237,0.22),transparent_42%),radial-gradient(ellipse_at_85%_80%,rgba(8,145,178,0.16),transparent_45%)]" />
                <div className="pointer-events-none absolute -left-20 top-1/3 h-64 w-64 rounded-full bg-violet-600/10 blur-3xl" />
                <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
                <div className="relative z-10 flex w-full max-w-sm flex-col items-center rounded-3xl border border-white/10 bg-white/[0.045] p-8 shadow-[0_30px_100px_-35px_rgba(124,58,237,0.5)] backdrop-blur-2xl">
                    <div className="mb-8">
                        <img src="/seanime-logo.png" alt="logo" className="w-14 h-auto drop-shadow-[0_0_18px_rgba(167,139,250,0.4)]" />
                    </div>
                    <div className="flex flex-col items-center gap-6">
                    <Avatar
                        src={selectedProfile.avatarPath || selectedProfile.anilistAvatar || undefined}
                        fallback={selectedProfile.name.charAt(0).toUpperCase()}
                        size="xl"
                        className="w-24 h-24 text-3xl ring-4 ring-violet-300/20 shadow-xl shadow-violet-950/60"
                    />
                    <h2 className="text-xl font-semibold text-white">
                        {selectedProfile.name}
                    </h2>

                    <p className="text-sm text-white/55">Enter your PIN</p>

                    {/* Dot indicators */}
                    <div className="flex gap-3">
                        {Array.from({ length: MAX_PIN_LENGTH }).map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "w-3 h-3 rounded-full transition-all duration-200",
                                    i < pin.length
                                        ? "scale-110 bg-violet-300 shadow-[0_0_12px_rgba(196,181,253,0.8)]"
                                        : i < MIN_PIN_LENGTH
                                            ? "bg-white/20"
                                            : "bg-white/10 opacity-50",
                                )}
                            />
                        ))}
                    </div>

                    {pinError && (
                        <p className="text-sm text-red-500 animate-shake">{pinError}</p>
                    )}

                    {/* 3×4 Keypad grid */}
                    <div className="grid grid-cols-3 gap-3 mt-2">
                        {[
                            "1", "2", "3", "4", "5", "6", "7", "8", "9"
                        ].map((digit) => (
                            <KeypadButton
                                key={digit}
                                label={digit}
                                pressed={pressedKey === digit}
                                onClick={() => handleKeypadPress(digit)}
                                disabled={pin.length >= MAX_PIN_LENGTH}
                            />
                        ))}
                        <KeypadButton
                            label={<MdBackspace className="text-xl" />}
                            pressed={pressedKey === "backspace"}
                            onClick={() => handleKeypadPress("backspace")}
                            disabled={pin.length === 0}
                            variant="utility"
                        />
                        <KeypadButton
                            label="0"
                            pressed={pressedKey === "0"}
                            onClick={() => handleKeypadPress("0")}
                            disabled={pin.length >= MAX_PIN_LENGTH}
                        />
                        <KeypadButton
                            label={<BiCheck className="text-2xl" />}
                            pressed={pressedKey === "submit"}
                            onClick={() => handleKeypadPress("submit")}
                            disabled={pin.length < MIN_PIN_LENGTH || isPending}
                            variant="submit"
                        />
                    </div>

                    <Button
                        intent="gray-basic"
                        size="sm"
                        leftIcon={<BiArrowBack />}
                        onClick={handleBack}
                        className="mt-2 text-white/65 hover:text-white"
                    >
                        Back
                    </Button>
                    </div>
                </div>
            </div>
        );
    }

    // Profile grid
    return (
        <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#080a16] px-4 py-10 text-white">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_10%,rgba(124,58,237,0.22),transparent_42%),radial-gradient(ellipse_at_85%_80%,rgba(8,145,178,0.16),transparent_45%)]" />
            <div className="pointer-events-none absolute -left-20 top-1/3 h-64 w-64 rounded-full bg-violet-600/10 blur-3xl" />
            <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="relative z-10 flex w-full max-w-3xl flex-col items-center rounded-3xl border border-white/10 bg-white/[0.045] p-8 shadow-[0_30px_100px_-35px_rgba(124,58,237,0.5)] backdrop-blur-2xl sm:p-10">
            <div className="mb-7">
                <img src="/seanime-logo.png" alt="logo" className="w-14 h-auto drop-shadow-[0_0_18px_rgba(167,139,250,0.4)]" />
            </div>
            <h1 className="mb-2 bg-gradient-to-r from-violet-200 via-white to-cyan-200 bg-clip-text text-3xl font-bold text-transparent">Who's watching?</h1>
            <p className="mb-8 text-sm text-white/50">Choose a profile to continue</p>
            <div className="flex max-w-2xl flex-wrap justify-center gap-4 sm:gap-6">
                {profiles.map((profile) => (
                    <button
                        key={profile.id}
                        onClick={() => handleProfileClick(profile)}
                        className="group flex min-w-32 flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 transition-all duration-200 hover:-translate-y-1 hover:border-violet-300/40 hover:bg-violet-400/[0.08] hover:shadow-[0_14px_40px_-18px_rgba(139,92,246,0.7)] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                    >
                        <div className="relative">
                            <Avatar
                                src={profile.avatarPath || profile.anilistAvatar || undefined}
                                fallback={profile.name.charAt(0).toUpperCase()}
                                size="xl"
                                className="w-24 h-24 rounded-xl border-2 border-white/10 text-3xl shadow-lg shadow-black/30 transition-colors group-hover:border-violet-300/60"
                            />
                            {profile.isAdmin && (
                                <div className="absolute -right-2 -top-2 rounded-full border border-white/20 bg-gradient-to-r from-violet-500 to-cyan-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-lg shadow-violet-950/50">
                                    Admin
                                </div>
                            )}
                        </div>
                        <span className="text-sm font-medium text-white/65 transition-colors group-hover:text-white">
                            {profile.name}
                        </span>
                    </button>
                ))}
            </div>
            {onManageProfiles && (
                <Button
                    intent="gray"
                    size="sm"
                    className="mt-8 border border-violet-300/20 bg-violet-400/10 text-violet-100 hover:bg-violet-400/20"
                    leftIcon={<BiPlus />}
                    onClick={onManageProfiles}
                >
                    Manage Profiles
                </Button>
            )}
            </div>
        </div>
    )
}

type KeypadButtonProps = {
    label: React.ReactNode
    pressed: boolean
    onClick: () => void
    disabled?: boolean
    variant?: "digit" | "utility" | "submit"
}

function KeypadButton({ label, pressed, onClick, disabled, variant = "digit" }: KeypadButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold transition-all duration-150 select-none",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[--brand] focus-visible:ring-offset-2 focus-visible:ring-offset-[--background]",
                "disabled:opacity-30 disabled:cursor-not-allowed",
                variant === "digit" && [
                    "border border-white/10 bg-white/[0.06] text-white",
                    "hover:border-violet-300/35 hover:bg-violet-400/15 active:bg-violet-400/25",
                    pressed && "scale-90 border-violet-300/50 bg-violet-400/25",
                ],
                variant === "utility" && [
                    "border border-transparent bg-transparent text-white/50",
                    "hover:bg-white/10 hover:text-white active:text-white",
                    pressed && "scale-90 text-white",
                ],
                variant === "submit" && [
                    "border border-violet-300/30 bg-gradient-to-br from-violet-400/25 to-cyan-400/15 text-violet-100",
                    "hover:border-violet-200/50 hover:from-violet-400/35 hover:to-cyan-400/25",
                    pressed && "scale-90 from-violet-400/45 to-cyan-400/30",
                ],
            )}
        >
            {label}
        </button>
    )
}