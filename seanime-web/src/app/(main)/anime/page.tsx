"use client"

import { HomeScreen } from "@/app/(main)/(library)/_home/home-screen"

// The anime library, at its own address.
//
// It used to be the landing page, which meant the app opened inside one of its own rooms and
// everything else was a walk back to the sidebar. The library is still exactly the same screen —
// this is the same component, moved — and the landing page is now a map of the app rather than a
// part of it.
export default function Page() {
    return <HomeScreen />
}
