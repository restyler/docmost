import { useMutation, UseMutationResult } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { askAi, IAiSearchResponse } from "@/ee/ai/services/ai-search-service.ts";
import { IPageSearchParams } from "@/features/search/types/search.types.ts";

// @ts-ignore
interface UseAiSearchResult extends UseMutationResult<IAiSearchResponse, Error, IPageSearchParams> {
  streamingAnswer: string;
  streamingSources: any[];
  streamingMeta?: IAiSearchResponse["meta"];
  clearStreaming: () => void;
}

export function useAiSearch(): UseAiSearchResult {
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [streamingSources, setStreamingSources] = useState<any[]>([]);
  const [streamingMeta, setStreamingMeta] = useState<IAiSearchResponse["meta"]>();
  const [latestSources, setLatestSources] = useState<any[]>([]);
  const [latestMeta, setLatestMeta] = useState<IAiSearchResponse["meta"]>();

  const clearStreaming = useCallback(() => {
    setStreamingAnswer("");
    setStreamingSources([]);
    setStreamingMeta(undefined);
    setLatestSources([]);
    setLatestMeta(undefined);
  }, []);

  const mutation = useMutation({
    mutationFn: async (params: IPageSearchParams & { contentType?: string }) => {
      setStreamingAnswer("");
      setStreamingSources([]);
      setStreamingMeta(undefined);
      setLatestSources([]);
      setLatestMeta(undefined);

      const { contentType, ...apiParams } = params;

      return await askAi(apiParams, (chunk) => {
        if (chunk.content) {
          setStreamingAnswer((prev) => prev + chunk.content);
        }
        if (chunk.sources) {
          setStreamingSources(chunk.sources);
          setLatestSources(chunk.sources);
        }
        if (chunk.meta) {
          setStreamingMeta(chunk.meta);
          setLatestMeta(chunk.meta);
        }
      });
    },
    onSuccess: (data) => {
      if (data?.sources?.length) {
        setStreamingSources(data.sources);
        setLatestSources(data.sources);
      }
      if (data?.meta) {
        setStreamingMeta(data.meta);
        setLatestMeta(data.meta);
      }
    },
  });

  return {
    ...mutation,
    streamingAnswer,
    streamingSources,
    latestSources,
    latestMeta,
    streamingMeta,
    clearStreaming,
  };
}
