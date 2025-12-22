import React, { useMemo } from "react";
import { Paper, Text, Group, Stack, Loader, Box } from "@mantine/core";
import { IconSparkles, IconFileText } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { IAiSearchResponse } from "../services/ai-search-service.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { markdownToHtml } from "@docmost/editor-ext";
import DOMPurify from "dompurify";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";

interface AiSearchResultProps {
  result?: IAiSearchResponse;
  isLoading?: boolean;
  streamingAnswer?: string;
  streamingSources?: any[];
  latestSources?: any[];
  streamingMeta?: IAiSearchResponse["meta"];
}

export function AiSearchResult({
  result,
  isLoading,
  streamingAnswer = "",
  streamingSources = [],
  latestSources = [],
  streamingMeta,
}: AiSearchResultProps) {
  const { t } = useTranslation();

  // Use streaming data if available, otherwise fall back to result
  const answer = streamingAnswer || result?.answer || "";
  const incomingSources =
    streamingSources.length > 0
      ? streamingSources
      : latestSources.length > 0
        ? latestSources
        : result?.sources || [];

  // persist last non-empty sources so they don't disappear when streaming ends
  const [persistedSources, setPersistedSources] = useState<any[]>([]);
  useEffect(() => {
    if (incomingSources && incomingSources.length > 0) {
      setPersistedSources(incomingSources);
    }
  }, [incomingSources]);
  const sources = incomingSources.length > 0 ? incomingSources : persistedSources;
  const meta = streamingMeta || result?.meta;

  // Deduplicate sources by pageId, keeping the one with highest similarity
  const deduplicatedSources = useMemo(() => {
    if (!sources || sources.length === 0) return [];

    const pageMap = new Map();
    sources.forEach((source) => {
      const existing = pageMap.get(source.pageId);
      if (!existing || source.similarity > existing.similarity) {
        pageMap.set(source.pageId, source);
      }
    });

    return Array.from(pageMap.values());
  }, [sources]);

  if (isLoading && !answer && deduplicatedSources.length === 0) {
    return (
      <Paper p="md" radius="md" withBorder>
        <Group>
          <Loader size="sm" />
          <Text size="sm">{t("AI is thinking...")}</Text>
        </Group>
      </Paper>
    );
  }

  return (
    <Stack gap="md" p="md">
      <Paper p="md" radius="md" withBorder>
        <Group gap="xs" mb="sm">
          <IconSparkles size={20} color="var(--mantine-color-blue-6)" />
          <Text fw={600} size="sm">
            {t("AI Answer")}
          </Text>
          {isLoading && <Loader size="xs" />}
          {meta && (meta.chunkCount || meta.pageCount) && (
            <Text size="xs" c="dimmed">
              {t("Context")}: {meta.chunkCount ?? 0} {t("chunks")} •{" "}
              {meta.pageCount ?? 0} {t("pages")}
            </Text>
          )}
        </Group>
        {answer ? (
          <div
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(markdownToHtml(answer) as string),
            }}
          />
        ) : (
          <Text size="sm" c="dimmed">
            {isLoading ? t("AI is thinking...") : t("No answer yet")}
          </Text>
        )}
      </Paper>

      {deduplicatedSources.length > 0 && (
        <Stack gap="xs">
          <Text size="xs" fw={600} c="dimmed">
            {t("Context sources")} ({deduplicatedSources.length})
          </Text>
          {deduplicatedSources.map((source) => (
            <Group
              key={source.pageId}
              gap="xs"
              align="center"
              wrap="nowrap"
              component={Link}
              to={buildPageUrl(source.spaceSlug, source.slugId, source.title)}
              style={{
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <IconFileText size={16} />
              <Text size="sm" truncate>
                {source.title}
              </Text>
              {typeof source.chunkCount === "number" && (
                <Text size="xs" c="dimmed">
                  {source.chunkCount} {t("chunks")}
                </Text>
              )}
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
