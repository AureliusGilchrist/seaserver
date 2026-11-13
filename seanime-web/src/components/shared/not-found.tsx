import { LuffyError } from "@/components/shared/luffy-error"
import { Button } from "@/components/ui/button"
import { Link } from "@tanstack/react-router"
import React from "react"
import { ThemeEgg } from "@/lib/theme/anime-themes/theme-flavor"

export function NotFound() {
    return (
        <div className="p-4 flex flex-col items-center justify-center h-full">
            <LuffyError title="Page Not Found">
                <p className="text-[--muted] mb-4">
                    The page you are looking for does not exist.
                </p>
                <ThemeEgg spot="notFound" className="-mt-2 mb-4" />
                <Link to="/">
                    <Button>Go Home</Button>
                </Link>
            </LuffyError>
        </div>
    )
}
