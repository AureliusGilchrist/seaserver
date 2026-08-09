"use client"
import { Button, ButtonProps } from "@/components/ui/button"
import { openTab } from "@/lib/helpers/browser"
import { ANILIST_PIN_URL } from "@/lib/server/config"
import { __isElectronDesktop__, __isTauriDesktop__ } from "@/types/constants"
import React from "react"

/**
 * How long the token page waits behind it.
 *
 * Long enough for a browser that was not running to have started and restored its cookies, short
 * enough not to feel like the button did nothing. A guess at a number that depends on the machine —
 * if the token page still lands on login, this is the value to raise.
 */
const BROWSER_WARMUP_MS = 2000

/** AniList's mark, duplicated inline at several call sites before this existed. */
export function AnilistLogo() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="24" height="24"
            viewBox="0 0 24 24" role="img" aria-hidden="true"
        >
            <path
                d="M6.361 2.943 0 21.056h4.942l1.077-3.133H11.4l1.052 3.133H22.9c.71 0 1.1-.392 1.1-1.101V17.53c0-.71-.39-1.101-1.1-1.101h-6.483V4.045c0-.71-.392-1.102-1.101-1.102h-2.422c-.71 0-1.101.392-1.101 1.102v1.064l-.758-2.166zm2.324 5.948 1.688 5.018H7.144z"
            />
        </svg>
    )
}

/**
 * Opens AniList's token page, and says out loud that the first attempt often lands somewhere else.
 *
 * Opening that URL frequently shows AniList's login page rather than the token — even when you are
 * already logged in and no login is actually required. Closing the tab and pressing again gets the
 * token. The cause is not ours to fix: the page is opened in the system browser, and a browser that
 * was not already running answers the first navigation before it has finished restoring its session,
 * so AniList sees a request with no cookies. The second navigation, to a warm browser, is fine.
 *
 * What was ours to fix is that nobody could know that. The instruction only appears once the button
 * has been pressed, so it reads as an explanation of what just happened rather than a warning about
 * something that might not.
 *
 * One component rather than five copies of a link, because this hint is the kind of thing that gets
 * added in one place and quietly missing from the other four.
 */
export function AnilistTokenButton({ label = "Get AniList token", ...buttonProps }: {
    label?: React.ReactNode
} & Omit<ButtonProps, "onClick" | "children">) {

    const [opened, setOpened] = React.useState(false)

    // Two tabs are only opened from the desktop app — see the click handler.
    const opensTwoTabs = __isElectronDesktop__ || __isTauriDesktop__

    return (
        <div className="space-y-2" data-anilist-token-button>
            <Button
                {...buttonProps}
                aria-label="Get AniList token"
                onClick={() => {
                    setOpened(true)

                    // In a browser, the browser is by definition already running — this component is
                    // being rendered by it — so there is no race and one tab is all that is wanted.
                    if (!__isElectronDesktop__ && !__isTauriDesktop__) {
                        openTab(ANILIST_PIN_URL)
                        return
                    }

                    // From the desktop app the link is handed to the system browser, which may be
                    // starting from cold — the first request arrives before it has restored its
                    // session, and AniList answers with a login page. So the same page is asked for
                    // twice: the first request absorbs the cold start, the second lands on a browser
                    // that is ready and returns the token.
                    //
                    // This is the retry done for you, and it is deliberately the same URL both times
                    // rather than a warm-up page — if the first request happens to succeed (a browser
                    // that was already running), that tab is the token and the second is a harmless
                    // duplicate of it, instead of a stray page you have to work out the purpose of.
                    //
                    // The first tab is left open. Nothing here can close a tab in the system browser:
                    // it was handed over with shell.openExternal, which returns no handle.
                    openTab(ANILIST_PIN_URL)
                    window.setTimeout(() => openTab(ANILIST_PIN_URL), BROWSER_WARMUP_MS)
                }}
            >
                {opened ? "Open AniList again" : label}
            </Button>

            {/* Said before the press, not only after it. Two browser tabs opening from one click
                looks like a bug or a mis-click if nothing warned you, and somebody who has just been
                asked to paste an access token is exactly the person who should not be wondering
                whether the app is behaving oddly. */}
            {(opensTwoTabs && !opened) && (
                <p className="text-xs text-[--muted] max-w-sm mx-auto" data-anilist-token-button-note>
                    This opens the token page twice, in two tabs. AniList often answers the first
                    request with its login page, so the second one is the retry — done for you rather
                    than by hand.
                </p>
            )}

            {opened && (
                <p className="text-xs text-[--muted] max-w-sm mx-auto" data-anilist-token-button-hint>
                    {opensTwoTabs
                        ? <>Two tabs were opened, both for the token page — use whichever one shows a
                            token and close the other. If neither does, close both and press again.</>
                        : <>Landed on AniList's login page instead of a token? Close that tab and press
                            again — the token is usually there the second time.</>}
                </p>
            )}
        </div>
    )
}
