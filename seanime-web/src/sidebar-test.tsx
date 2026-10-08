import React from "react"
import { createRoot } from "react-dom/client"
import { VerticalMenu } from "@/components/ui/vertical-menu"
import { LuMonitorPlay, LuCalendar, LuBookOpen, LuListVideo, LuCompass, LuWrench } from "react-icons/lu"
import "./app/globals.css"

// A standalone reproduction of the sidebar's group folds: the real VerticalMenu, the same item
// shape the sidebar builds, in a browser where the clicks can be watched. Temporary — delete once
// the folding is diagnosed.
const items = [
    { id: "group-watch", name: "Watch", iconType: LuMonitorPlay, isGroupHeading: true },
    { id: "anime", iconType: LuMonitorPlay, name: "Anime", href: "#", isCurrent: false },
    { id: "schedule", iconType: LuCalendar, name: "Schedule", href: "#", isCurrent: false },
    { id: "manga", iconType: LuBookOpen, name: "Manga", href: "#", isCurrent: false },
    { id: "to-watch", iconType: LuListVideo, name: "To Watch", href: "#", isCurrent: false },
    { id: "group-anilist", name: "AniList", iconType: LuCompass, isGroupHeading: true },
    { id: "discover", iconType: LuCompass, name: "Discover", href: "#", isCurrent: false },
    { id: "group-tools", name: "Tools", iconType: LuWrench, isGroupHeading: true },
    { id: "search", iconType: LuWrench, name: "Search", isCurrent: false },
]

function Test() {
    const [, force] = React.useReducer(n => n + 1, 0)
    // The collapsed-state atom is rendered straight from localStorage by the menu itself; force is
    // only here so the collapse state can be read back out for the test.
    return (
        <div style={{ width: 260, padding: 16, background: "#0b0b0b", color: "#fff", minHeight: "100dvh" }}>
            <h3 style={{ marginBottom: 12 }}>Sidebar fold reproduction</h3>
            <VerticalMenu
                items={items as any}
                isSidebar
                onAnyItemClick={() => force()}
            />
            <p id="state-out" style={{ marginTop: 16, fontSize: 12, opacity: 0.7 }}>click a heading</p>
        </div>
    )
}

const el = document.getElementById("root")!
createRoot(el).render(<Test />)
