import { Helmet } from "react-helmet-async";
import { getAppName, getAiModuleFlavor, isCloud } from "@/lib/config.ts";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import React from "react";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useTranslation } from "react-i18next";
import useLicense from "@/ee/hooks/use-license.tsx";
import EnableAiSearch from "@/ee/ai/components/enable-ai-search.tsx";
import { Alert } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api-client.ts";

export default function AiSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const { hasLicenseKey } = useLicense();
  const { data: status } = useQuery({
    queryKey: ["ai-status"],
    queryFn: async () => {
      const res = await api.get("/ai/status");
      return res.data as { embeddingsTable: boolean; flavor: string; driver: string };
    },
  });

  const isOssAiFromStatus = status?.flavor === "oss";
  const isOssAiEnv = getAiModuleFlavor() === "oss";
  const isOssAi =
    typeof isOssAiFromStatus === "boolean" ? isOssAiFromStatus : isOssAiEnv;

  if (!isAdmin) {
    return null;
  }

  const hasAccess = isOssAi || isCloud() || (!isCloud() && hasLicenseKey);

  return (
    <>
      <Helmet>
        <title>AI - {getAppName()}</title>
      </Helmet>
      <SettingsTitle title={t("AI settings")} />

      {!hasAccess && (
        <Alert
          icon={<IconInfoCircle />}
          title={t("Enterprise feature")}
          color="blue"
          mb="lg"
        >
          {t(
            "AI is only available in the Docmost enterprise edition. Contact sales@docmost.com.",
          )}
        </Alert>
      )}

      {isOssAi && (
        <Alert
          icon={<IconInfoCircle />}
          title={t("OSS AI flavor active")}
          color="green"
          mb="lg"
        >
          {t("You have activated OSS flavor for AI search.")}
        </Alert>
      )}

      <EnableAiSearch status={status} />
    </>
  );
}
