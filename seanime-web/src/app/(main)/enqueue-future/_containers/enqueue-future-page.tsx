"use client";

import { useGetEnqueueFutureQueue } from "@/api/hooks/enqueue_future.hooks";
import { EnqueueFutureList, familyDepths } from "@/app/(main)/enqueue-future/_components/enqueue-future-list";
import { EnqueueFutureHeader } from "@/app/(main)/enqueue-future/_components/enqueue-future-header";
import { useClearDownloadingMediaState, useGetStuckDownloadingMediaIds } from "@/api/hooks/torrent_client.hooks";
import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import { LuRefreshCcw } from "react-icons/lu";
import { toast } from "sonner";

export function EnqueueFuturePage() {
    const { data: queue, isLoading, isError, error } = useEnqueueFutureQueue();
    const { data: stuckIds = [] } = useGetStuckDownloadingMediaIds();
    const queryClient = useQueryClient();

    const [activeMediaId, setActiveMediaId] = React.useState<number | undefined>(undefined);

    const handleSelect = (mediaId: number) => {
        setActiveMediaId(mediaId);
    };

    const [mediaId, setMediaId] = React.useState<number | undefined>(undefined);
    const { mutate: clearDownloadingState } = useClearDownloadingMediaState(mediaId);

    const clearStale = () => {
        if (!stuckIds.length) {
            toast.warning("No stuck downloads to clear");
            return;
        }
        stuckIds.forEach(id => clearDownloadingState(id));
        toast.success(`Cleared ${stuckIds.length} stuck download${stuckIds.length > 1 ? "s" : ""}`);
        queryClient.invalidateQueries({ queryKey: ["enqueue-future"] });
        queryClient.invalidateQueries({ queryKey: ["stuck-downloading-ids"] });
    };

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
                <p className="text-amber-400">{error?.message || "Failed to load queue"}</p>
            </div>
        );
    }

    const families = queue?.items ? [queue.items] : [];

    return (
        <>
            <EnqueueFutureHeader
                item={queue?.items?.[0]}
                index={0}
                total={queue?.items?.length ?? 0}
                onPrevious={() => {}}
                onNext={() => {}}
                autoMatch={false}
                onAutoMatchChange={() => {}}
                clearStale={clearStale}
                isClearing={false}
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