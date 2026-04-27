"use client"
import { Tooltip } from "@/components/ui/tooltip"
import { cn } from "@/components/ui/core/styling"
import { useAtom } from "jotai/react"
import { PrimitiveAtom } from "jotai"
import { LuLayoutGrid } from "react-icons/lu"

interface CardSizeSliderProps {
    atom: PrimitiveAtom<number>
    className?: string
}

export function CardSizeSlider({ atom, className }: CardSizeSliderProps) {
    const [size, setSize] = useAtom(atom)

    return (
        <Tooltip trigger={
            <div className={cn("flex items-center gap-2 px-3 h-10 bg-gray-900/50 rounded-md", className)}>
                <LuLayoutGrid className="text-lg text-gray-400 flex-shrink-0" />
                <input
                    type="range"
                    className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[--brand]"
                    value={size}
                    onChange={(e) => setSize(parseFloat(e.target.value))}
                    min={0.6}
                    max={1.4}
                    step={0.1}
                />
            </div>
        }>
            Card Size
        </Tooltip>
    )
}
