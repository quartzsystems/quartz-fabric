"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Code,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconClock,
  IconDatabase,
  IconNetwork,
  IconServer,
  IconShieldCheck,
  IconUsers,
} from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { settings, type ApiSettings } from "@/lib/api";

interface ConfigRow {
  label: string;
  value: string | number;
  unit?: string;
  mono?: boolean;
}

function ConfigCard({
  title,
  icon,
  rows,
  loading,
}: {
  title: string;
  icon: React.ReactNode;
  rows: ConfigRow[];
  loading: boolean;
}) {
  return (
    <Paper p="lg" radius="md" withBorder bg="dark.7">
      <Group gap="xs" mb="md">
        <ThemeIcon size={28} radius="sm" color="brand" variant="light">
          {icon}
        </ThemeIcon>
        <Title order={5} fw={600}>
          {title}
        </Title>
      </Group>
      <Divider mb="md" />
      <Stack gap="sm">
        {rows.map((row) => (
          <Group key={row.label} justify="space-between" wrap="nowrap">
            <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
              {row.label}
            </Text>
            {loading ? (
              <Skeleton h={20} w={120} radius="sm" />
            ) : row.mono ? (
              <Code fz="xs">{String(row.value)}{row.unit ? ` ${row.unit}` : ""}</Code>
            ) : (
              <Text size="sm" fw={500} ta="right">
                {row.value}
                {row.unit ? ` ${row.unit}` : ""}
              </Text>
            )}
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<ApiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    settings
      .get()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const isAdmin = user?.role === "admin";

  return (
    <Box p="xl">
      <Stack gap="xl">
        <Group justify="space-between">
          <Box>
            <Title order={3} fw={600}>
              Settings
            </Title>
            <Text c="dimmed" size="sm">
              System configuration &amp; runtime information
            </Text>
          </Box>
          {isAdmin && (
            <Badge color="brand" variant="light" size="md">
              Admin View
            </Badge>
          )}
        </Group>

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        )}

        {!isAdmin && (
          <Alert icon={<IconShieldCheck size={16} />} color="blue" variant="light">
            Some configuration details are visible to administrators only. Contact your admin to
            change system settings.
          </Alert>
        )}

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <ConfigCard
            title="Polling"
            icon={<IconClock size={16} />}
            loading={loading}
            rows={[
              {
                label: "Poll interval",
                value: data ? Math.floor(data.poll_interval_secs / 60) : "—",
                unit: data ? "min" : "",
              },
              {
                label: "Poll interval (seconds)",
                value: data?.poll_interval_secs ?? "—",
                unit: "s",
              },
              {
                label: "Max concurrent SSH connections",
                value: data?.poll_concurrency ?? "—",
              },
            ]}
          />

          <ConfigCard
            title="SSH Timeouts"
            icon={<IconNetwork size={16} />}
            loading={loading}
            rows={[
              {
                label: "Connection timeout",
                value: data?.ssh_connect_timeout_secs ?? "—",
                unit: "s",
              },
              {
                label: "Read timeout",
                value: data?.ssh_read_timeout_secs ?? "—",
                unit: "s",
              },
            ]}
          />

          <ConfigCard
            title="Authentication"
            icon={<IconShieldCheck size={16} />}
            loading={loading}
            rows={[
              {
                label: "Session token expiry",
                value: data?.jwt_expiry_hours ?? "—",
                unit: "hours",
              },
            ]}
          />

          {isAdmin && (
            <ConfigCard
              title="Server"
              icon={<IconServer size={16} />}
              loading={loading}
              rows={[
                {
                  label: "Listen address",
                  value: data?.listen_addr ?? "—",
                  mono: true,
                },
                {
                  label: "CORS allowed origin",
                  value: data?.cors_origin ?? "—",
                  mono: true,
                },
              ]}
            />
          )}
        </SimpleGrid>

        <Paper p="lg" radius="md" withBorder bg="dark.7">
          <Group gap="xs" mb="sm">
            <ThemeIcon size={28} radius="sm" color="gray" variant="light">
              <IconDatabase size={16} />
            </ThemeIcon>
            <Title order={5} fw={600}>
              Configuration Notes
            </Title>
          </Group>
          <Divider mb="md" />
          <Stack gap="xs">
            <Text size="sm" c="dimmed">
              These settings are configured via the <Code>backend/.env</Code> file and take effect
              after a backend restart. No in-app changes are persisted.
            </Text>
            <Text size="sm" c="dimmed">
              To change polling behavior, SSH timeouts, or authentication settings, update the
              corresponding environment variables and restart the backend service.
            </Text>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}
