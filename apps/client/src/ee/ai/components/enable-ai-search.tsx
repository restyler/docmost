import { Group, Text, Switch, MantineSize, Title, Alert } from "@mantine/core";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { notifications } from "@mantine/notifications";
import { getAiModuleFlavor, isCloud } from "@/lib/config.ts";
import useLicense from "@/ee/hooks/use-license.tsx";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api-client.ts";
import { IconInfoCircle } from "@tabler/icons-react";

type AiStatus =
  | {
      embeddingsTable: boolean;
      flavor: string;
      driver: string;
      queueCounts?: Record<string, number>;
    }
  | undefined;

export default function EnableAiSearch({ status }: { status?: AiStatus }) {
  const { t } = useTranslation();

  const { data: statusFetch } = useQuery({
    queryKey: ["ai-status"],
    queryFn: async () => {
      const res = await api.get("/ai/status");
      return res.data as {
        embeddingsTable: boolean;
        flavor: string;
        driver: string;
        queueCounts?: Record<string, number>;
      };
    },
    enabled: !status,
  });
  const effectiveStatus = status ?? statusFetch;

  return (
    <>
      <Group justify="space-between" wrap="nowrap" gap="xl">
        <div>
          <Text size="md">{t("AI-powered search (Ask AI)")}</Text>
          <Text size="sm" c="dimmed">
            {t(
              "AI search uses vector embeddings to provide semantic search capabilities across your workspace content.",
            )}
          </Text>
        </div>

        <AiSearchToggle status={effectiveStatus} />
      </Group>

      {effectiveStatus && !effectiveStatus.embeddingsTable && (
        <Alert
          icon={<IconInfoCircle />}
          color="red"
          mt="md"
          title={t("pgvector missing")}
        >
          {t("pgvector extension or page_embeddings table is missing on the server.")}
        </Alert>
      )}

      {effectiveStatus && effectiveStatus.queueCounts && (
        <Alert
          icon={<IconInfoCircle />}
          color="gray"
          mt="md"
          title={t("AI indexing queue")}
        >
          <Text size="sm" c="dimmed">
            {t("Waiting")}: {effectiveStatus.queueCounts.waiting ?? 0} •{" "}
            {t("Active")}: {effectiveStatus.queueCounts.active ?? 0} •{" "}
            {t("Completed")}: {effectiveStatus.queueCounts.completed ?? 0} •{" "}
            {t("Failed")}: {effectiveStatus.queueCounts.failed ?? 0}
          </Text>
        </Alert>
      )}
    </>
  );
}

interface AiSearchToggleProps {
  size?: MantineSize;
  label?: string;
  status?: AiStatus;
}
export function AiSearchToggle({ size, label, status }: AiSearchToggleProps) {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [checked, setChecked] = useState(workspace?.settings?.ai?.search);
  const { hasLicenseKey } = useLicense();
  const isOssAiFromStatus = status?.flavor === "oss";
  const isOssAiEnv = getAiModuleFlavor() === "oss";
  const isOssAi =
    typeof isOssAiFromStatus === "boolean" ? isOssAiFromStatus : isOssAiEnv;

  const hasAccess = isOssAi || isCloud() || (!isCloud() && hasLicenseKey);

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    try {
      const updatedWorkspace = await updateWorkspace({ aiSearch: value });
      setChecked(value);
      setWorkspace(updatedWorkspace);
    } catch (err) {
      notifications.show({
        message: err?.response?.data?.message,
        color: "red",
      });
    }
  };

  return (
    <Switch
      size={size}
      label={label}
      labelPosition="left"
      defaultChecked={checked}
      onChange={handleChange}
      disabled={!hasAccess}
      aria-label={t("Toggle AI search")}
    />
  );
}
