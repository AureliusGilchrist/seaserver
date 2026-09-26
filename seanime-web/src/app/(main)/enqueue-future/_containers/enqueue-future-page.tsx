"use client";

import { useGetEnqueueFutureQueue } from "@/api/hooks/enqueue_future.hooks";
import { EnqueueFutureList, EnqueueFutureFamily } from "@/app/(main)/enqueue-future/_components/enqueue-future-list";
import { EnqueueFutureHeader } from "@/app/(main)/enqueue-future/_components/enqueue-future-header";
import { useClearAllStuckDownloadingMediaState, useGetStuckDownloadingMediaIds } from "@/api/hooks/torrent_client.hooks";
import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import { LuRefreshCcw } from "react-icons/lu";
import { toast } from "sonner";
import { EnqueueFuture_Item } from "@/api/generated/types";

export function EnqueueFuturePage() {
    const { data: queue, isLoading, isError, error } = useGetEnqueueFutureQueue();

    const { data: stuckIds = [], refetch: refetchStuck } = useGetStuckDownloadingMediaIds();
    const { mutate: clearStuck, isPending: isClearingStuck } = useClearAllStuckDownloadingMediaState(stuckIds);

    const queryClient = useQueryClient();

    const [activeMediaId, setActiveMediaId] = React.useState<number | undefined>(undefined);
    const handleSelect = (item: EnqueueFuture_Item) => setActiveMediaId(item.mediaId);

    const clearStale = () => {
        if (!stuckIds.length) {
            toast.warning("No stuck downloads to clear");
            return;
        }
        clearStuck(undefined, {
            onSuccess: (cleared) => {          // <-- accept any type
                const count = cleared ?? 0;   // handle possible undefined
                toast.success(`Cleared ${count} stuck download${count === 1 ? "" : "s"}`);
                refetchStuck();
                queryClient.invalidateQueries({ queryKey: ["/api/v1/enqueue-future/get-queue"] });
            },
        });
    };

    const families: EnqueueFutureFamily[] = queue ? queue.map(item => [item]) : [];

    if (isLoading) {
        return (
            <div className="p-4 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                    <LuRefreshCcw className="text-2xl text-brand-200 animate-spin" />
                    <h2 className="text-2xl font-bold">Enqueue Future</h2>
                </div>
                <p className="text-[--muted]">Loading queue...</p>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="p-4 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold">Enqueue Future</h2>
                </div>
                <p className="text-amber-400">{error?.message ?? "Failed to load queue"}</p>
            </div>
        );
    }

    return (
        <>
            <EnqueueFutureHeader
                item={queue?.[0]}
                index={0}
                total={queue?.length ?? 0}
                onPrevious={() => {}}
                onNext={() => {}}
                autoMatch={false}
                onAutoMatchChange={() => {}}
                clearStale={clearStale}
                isClearing={isClearingStuck}
            />
            <EnqueueFutureList
                families={families}
                activeMediaId={activeMediaId}
                onSelect={handleSelect}
            />
        </>
    );
}

export default EnqueueFuturePage;