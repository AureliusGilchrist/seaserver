"use client"

import { SeaLink } from "@/components/shared/sea-link"
import { cva, VariantProps } from "class-variance-authority"
import { atomWithStorage } from "jotai/utils"
import { useAtom } from "jotai/react"
import * as React from "react"
import { useContext } from "react"
import { cn, ComponentAnatomy, defineStyleAnatomy } from "../core/styling"
import { Disclosure, DisclosureContent, DisclosureItem, DisclosureTrigger } from "../disclosure"
import { Tooltip, TooltipProps } from "../tooltip"

/* -------------------------------------------------------------------------------------------------
 * Group collapsing
 * -----------------------------------------------------------------------------------------------*/

/**
 * Which groups are folded shut, by group name.
 *
 * Remembered across reloads on purpose: folding a group is a statement about what you do not need to
 * see — the same statement every time you open the app — and a sidebar that unfolds itself again on
 * the next launch is one you have to re-teach.
 */
export const __verticalMenuCollapsedGroups = atomWithStorage<Record<string, boolean>>(
    "sea-vertical-menu-collapsed-groups",
    {},
    undefined,
    { getOnInit: true },
)

/* -------------------------------------------------------------------------------------------------
 * Anatomy
 * -----------------------------------------------------------------------------------------------*/

export const VerticalMenuAnatomy = defineStyleAnatomy({
    root: cva([
        "UI-VerticalMenu__root",
        "flex flex-col gap-1",
    ]),
    item: cva([
        "UI-VerticalMenu__item",
        "group/verticalMenu_item relative flex flex-none items-center w-full font-medium rounded-lg transition cursor-pointer",
        "hover:text-[--foreground]",
        "focus-visible:bg-[--subtle] outline-none text-[--muted]",
        "data-[current=true]:bg-[--subtle] data-[current=true]:text-[--foreground]",
    ], {
        variants: {
            collapsed: {
                true: "justify-center",
                false: null,
            },
            isSidebar: {
                true: "rounded-full",
                false: null,
            },
        },
        defaultVariants: {
            collapsed: false,
            isSidebar: false,
        },
    }),
    itemContent: cva([
        "UI-VerticalMenu__itemContent",
        "w-full flex items-center relative",
    ], {
        variants: {
            size: {
                sm: "px-3 h-8 text-sm",
                md: "px-3 h-10 text-sm",
                lg: "px-3 h-12 text-base",
            },
            collapsed: {
                true: "justify-center",
                false: null,
            },
            isSidebar: {
                true: "",
                false: null,
            },
        },
        defaultVariants: {
            size: "md",
            collapsed: false,
            isSidebar: false,
        },
    }),
    parentItem: cva([
        "UI-VerticalMenu__parentItem",
        "group/verticalMenu_parentItem",
        "cursor-pointer w-full",
    ]),
    itemChevron: cva([
        "UI-VerticalMenu__itemChevron",
        "size-4 absolute transition-transform group-data-[state=open]/verticalMenu_parentItem:rotate-90",
    ], {
        variants: {
            size: {
                sm: "right-3",
                md: "right-3",
                lg: "right-3",
            },
            collapsed: {
                true: "top-1 left-1 size-3",
                false: null,
            },
            isSidebar: {
                true: "",
                false: null,
            },
        },
        defaultVariants: {
            size: "md",
            collapsed: false,
        },
    }),
    itemIcon: cva([
        "UI-VerticalMenu__itemIcon",
        "flex-shrink-0 mr-3 transition",
        "text-[--muted] text-xl",
        "group-hover/verticalMenu_item:text-[--foreground]", // Item Hover
        "group-data-[current=true]/verticalMenu_item:text-[--foreground]", // Item Current
    ], {
        variants: {
            size: {
                sm: "size-4",
                md: "size-5",
                lg: "size-6",
            },
            collapsed: {
                true: "mr-0",
                false: null,
            },
            isSidebar: {
                true: "group-hover/verticalMenu_item:scale-[1.05] group-hover/verticalMenu_item:-rotate-2",
                false: null,
            },
        },
        defaultVariants: {
            size: "md",
        },
    }),
    subContent: cva([
        "UI-VerticalMenu__subContent",
        "border-b py-1",
    ]),
})

/* -------------------------------------------------------------------------------------------------
 * VerticalMenu
 * -----------------------------------------------------------------------------------------------*/

const __VerticalMenuContext = React.createContext<Pick<VerticalMenuProps, "onAnyItemClick" | "onLinkItemClick"> & { collapsed?: boolean }>({})

export type VerticalMenuItem = {
    id?: string
    name: string
    href?: string | null | undefined
    iconType?: React.ElementType
    className?: string
    iconClass?: string
    isCurrent?: boolean
    onClick?: React.MouseEventHandler<HTMLElement>
    addon?: React.ReactNode
    subContent?: React.ReactNode
    subContentOpen?: boolean
    onSubContentOpenChange?: (open: boolean) => void
    isSidebar?: boolean
    /**
     * Renders the item as a group heading rather than a menu entry: an icon and a small label that
     * say what the entries under it are, and that cannot be clicked, focused or navigated to.
     */
    isGroupHeading?: boolean
}

export type VerticalMenuProps = React.ComponentPropsWithRef<"div"> &
    ComponentAnatomy<typeof VerticalMenuAnatomy> &
    VariantProps<typeof VerticalMenuAnatomy.itemContent> & {
    /**
     * The items to render.
     */
    items: VerticalMenuItem[]
    /**
     * Props passed to each item tooltip that is shown when the menu is collapsed.
     */
    itemTooltipProps?: Omit<TooltipProps, "trigger">
    /**
     * Callback fired when any item is clicked.
     */
    onAnyItemClick?: React.MouseEventHandler<HTMLElement>
    /**
     * Callback fired when a link item is clicked.
     */
    onLinkItemClick?: React.MouseEventHandler<HTMLElement>
}

export const VerticalMenu = React.forwardRef<HTMLDivElement, VerticalMenuProps>((props, ref) => {

    const {
        children,
        size = "md",
        collapsed: _collapsed1,
        onAnyItemClick,
        onLinkItemClick,
        /**/
        itemClass,
        itemIconClass,
        parentItemClass,
        subContentClass,
        itemChevronClass,
        itemContentClass,
        itemTooltipProps,
        className,
        items,
        isSidebar,
        ...rest
    } = props

    // Which groups are folded shut, read at the top of the component. It decides what the group
    // headings render as and whether the entries under them are drawn at all — state that belongs
    // to the render, not inside it.
    //
    // A group with no stored answer is shut, not open: the sidebar opens folded, and the only thing
    // that ever changes that is somebody opening a group by hand. Stored as what it is — `false`
    // means open, anything else (including absent) means folded — so the default is the collapsed
    // state rather than the expanded one, and opening a group is remembered for good.
    const [collapsedGroups, setCollapsedGroups] = useAtom(__verticalMenuCollapsedGroups)
    const isGroupCollapsed = React.useCallback(
        (name: string) => collapsedGroups?.[name] !== false,
        [collapsedGroups],
    )

    const {
        onLinkItemClick: _onLinkItemClick,
        onAnyItemClick: _onAnyItemClick,
        collapsed: _collapsed2,
    } = useContext(__VerticalMenuContext)

    const collapsed = _collapsed1 ?? _collapsed2 ?? false

    const itemProps = (item: VerticalMenuItem) => ({
        className: cn(
            VerticalMenuAnatomy.item({ collapsed, isSidebar }),
            itemClass,
        ),
        "data-current": item.isCurrent,
        onClick: (e: React.MouseEvent<HTMLElement>) => {
            if (item.href) {
                onLinkItemClick?.(e)
                _onLinkItemClick?.(e)
            }
            onAnyItemClick?.(e)
            _onAnyItemClick?.(e)
            item.onClick?.(e)
        },
    })

    const ItemContentWrapper = React.useCallback((props: { children: React.ReactElement, name: string }) => {
        return !collapsed ? props.children : (
            <Tooltip trigger={props.children} side="right" {...itemTooltipProps}>
                {props.name}
            </Tooltip>
        )
    }, [collapsed, itemTooltipProps])

    const ItemContent = React.useCallback((item: VerticalMenuItem) => (
        <ItemContentWrapper name={item.name}>
            <div
                data-vertical-menu-item={item.name}
                className={cn(
                    VerticalMenuAnatomy.itemContent({ size, collapsed, isSidebar }),
                    itemContentClass,
                    item.className,
                )}
            >
                {item.iconType && <item.iconType
                    className={cn(
                        VerticalMenuAnatomy.itemIcon({ size, collapsed, isSidebar }),
                        itemIconClass,
                        item.iconClass,
                    )}
                    aria-hidden="true"
                    data-current={item.isCurrent}
                    data-collapsed={collapsed}
                />}
                {!collapsed && <span>{item.name}</span>}
                {item.addon}
            </div>
        </ItemContentWrapper>
    ), [collapsed, size, itemContentClass, itemIconClass, isSidebar])

    return (
        <nav
            ref={ref}
            className={cn(VerticalMenuAnatomy.root(), className)}
            role="navigation"
            {...rest}
        >
            <__VerticalMenuContext.Provider
                value={{
                    onAnyItemClick,
                    onLinkItemClick,
                    collapsed: _collapsed1 ?? false,
                }}
            >
                {renderItems(items, {
                    collapsed,
                    isGroupCollapsed,
                    toggleGroup: setCollapsedGroups,
                    itemProps,
                    ItemContent,
                    itemChevronClass,
                    subContentClass,
                    parentItemClass,
                    itemClass,
                    size,
                    isSidebar,
                })}
            </__VerticalMenuContext.Provider>
        </nav>
    )

})

/**
 * The items, rendered.
 *
 * A plain function rather than an IIFE with hooks inside it: the React Compiler rewrites this
 * component, and hook calls inside nested functions are the one shape it does not transform — the
 * atom subscription silently never attached, so clicks updated storage and nothing on screen moved.
 * Every hook is read at the top of the component and passed in here as values.
 */
function renderItems(
    items: VerticalMenuItem[],
    ctx: {
        collapsed: boolean
        isGroupCollapsed: (name: string) => boolean
        toggleGroup: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
        itemProps: (item: VerticalMenuItem) => any
        ItemContent: (item: VerticalMenuItem) => React.ReactNode
        itemChevronClass?: string
        subContentClass?: string
        parentItemClass?: string
        itemClass?: string
        size?: "sm" | "md" | "lg" | null
        isSidebar?: boolean | null
    },
) {
    const { collapsed, isGroupCollapsed, toggleGroup, itemProps, ItemContent, itemChevronClass, subContentClass, parentItemClass, itemClass, size, isSidebar } = ctx

    // Which group each entry belongs to, decided as the list is walked: a heading starts its group,
    // and every entry after it is in that group until the next heading. Computed here rather than
    // on each item, so an entry carries nothing extra and a group without a heading hides nothing.
    let currentGroup: string | null = null

    return items.map((item, idx) => {
        // A group heading: the entries under it belong together, and this says what they are. A
        // collapsible one — a fold — rather than a plain label: a sidebar this long is a lot to
        // scroll when you only ever open half of it, and folding what you do not need is one press.
        // Still not an entry: it navigates to nothing, it only folds.
        if (item.isGroupHeading) {
            currentGroup = item.name
            const isFolded = isGroupCollapsed(item.name)
            return (
                <button
                    // Keyed on the group's name alone, not on the position: a fold changes nothing
                    // about where a heading sits, and a key that moved when entries hid made React
                    // remount the heading as a different node — losing the element the fold was
                    // supposed to act on.
                    key={item.name}
                    type="button"
                    data-vertical-menu-group={item.name}
                                data-vertical-menu-group-collapsed={isFolded || undefined}
                                onClick={() => {
                                    toggleGroup(prev => ({ ...(prev ?? {}), [item.name]: !isFolded }))
                                }}
                                className={cn(
                                    "flex items-center gap-2 select-none cursor-pointer group/group-heading",
                                    collapsed ? "justify-center py-1 mt-1" : "px-2 pt-4 pb-1",
                                )}
                                title={collapsed ? item.name : undefined}
                            >
                                {item.iconType && (
                                    <item.iconType
                                        className={cn(
                                            "flex-none text-[--muted] opacity-70",
                                            collapsed ? "size-4" : "size-3.5",
                                        )}
                                        aria-hidden="true"
                                    />
                                )}
                                {!collapsed && (
                                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[--muted] opacity-70 group-hover/group-heading:opacity-100">
                                        {item.name}
                                    </span>
                                )}
                                {!collapsed && (
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="10"
                                        height="10"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className={cn(
                                            "text-[--muted] opacity-0 group-hover/group-heading:opacity-70 transition-transform duration-200",
                                            isFolded && "rotate-180",
                                        )}
                                        aria-hidden="true"
                                    >
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                )}
                            </button>
                        )
                    }

                    // An entry in a group that is folded shut renders nothing. A collapsed sidebar
                    // shows everything — the icons are the navigation there — so folding only
                    // applies while the labels are shown.
                    if (currentGroup !== null && !collapsed && isGroupCollapsed(currentGroup)) {
                        return null
                    }

                    return (
                        <React.Fragment key={item.name + idx}>
                            {!item.subContent ?
                                item.href ? (
                                    <SeaLink href={item.href} {...itemProps(item)} data-vertical-menu-item-link={item.name}>
                                        <ItemContent {...item} />
                                    </SeaLink>
                                ) : (
                                    <button {...itemProps(item)} data-vertical-menu-item-button={item.name}>
                                        <ItemContent {...item} />
                                    </button>
                                ) : (
                                    <Disclosure
                                        type="single"
                                        collapsible
                                        defaultValue={item.subContentOpen ? item.name : undefined}
                                        onValueChange={v => item.onSubContentOpenChange?.(v.length > 0)}
                                    >
                                        <DisclosureItem value={item.name}>
                                            <DisclosureTrigger>
                                                <button
                                                    className={cn(
                                                        VerticalMenuAnatomy.item({ collapsed, isSidebar }),
                                                        itemClass,
                                                        VerticalMenuAnatomy.parentItem(),
                                                        parentItemClass,
                                                    )}
                                                    aria-current={item.isCurrent ? "page" : undefined}
                                                    data-current={item.isCurrent}
                                                    onClick={item.onClick}
                                                >
                                                    <ItemContent {...item} />
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        width="24"
                                                        height="24"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="2"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        className={cn(VerticalMenuAnatomy.itemChevron({ size, collapsed, isSidebar }),
                                                            itemChevronClass)}
                                                    >
                                                        <polyline points="9 18 15 12 9 6"></polyline>
                                                    </svg>
                                                </button>
                                            </DisclosureTrigger>

                                            <DisclosureContent className={cn(VerticalMenuAnatomy.subContent(), subContentClass)}>
                                                {item.subContent && item.subContent}
                                            </DisclosureContent>
                                        </DisclosureItem>
                                    </Disclosure>
                                )}
                        </React.Fragment>
                    )
    })
}

VerticalMenu.displayName = "VerticalMenu"
