"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Grid,
  Group,
  Paper,
  RingProgress,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Badge,
  Table,
  ScrollArea,
  Alert,
} from "@mantine/core";
import {
  IconDeviceDesktopAnalytics,
  IconWifi,
  IconWifiOff,
  IconAlertTriangle,
  IconUsers,
  IconActivity,
  IconAlertCircle,
} from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { summary, type ApiSummary } from "@/lib/api";

const SEVERITY_COLORS: Record<string, string> = {
  error: "red",
  warning: "yellow",
  info: "blue",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<ApiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    summary
      .get()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load summary"))
      .finally(() => setLoading(false));
  }, []);

  const total = data?.total_devices ?? 0;
  const online = data?.online_devices ?? 0;
  const offline = data?.offline_devices ?? 0;
  const warning = data?.warning_devices ?? 0;
  const onlinePct = total > 0 ? Math.round((online / total) * 1000) / 10 : 0;
  const warnPct = total > 0 ? Math.round((warning / total) * 1000) / 10 : 0;
  const offlinePct = total > 0 ? Math.round((offline / total) * 1000) / 10 : 0;

  const statCards = [
    { label: "Total Devices", value: total, icon: <IconDeviceDesktopAnalytics size={22} />, color: "brand", sub: "Dell OS9 Switches" },
    { label: "Online", value: online, icon: <IconWifi size={22} />, color: "green", sub: `${onlinePct}% uptime` },
    { label: "Offline", value: offline, icon: <IconWifiOff size={22} />, color: "red", sub: offline > 0 ? "Requires attention" : "All clear" },
    { label: "Warning", value: warning, icon: <IconAlertTriangle size={22} />, color: "yellow", sub: warning > 0 ? "Needs review" : "All clear" },
    { label: "Active Users", value: data?.active_users ?? 0, icon: <IconUsers size={22} />, color: "blue", sub: `of ${data?.total_users ?? 0} total` },
    { label: "Recent Events", value: data?.recent_events.length ?? 0, icon: <IconActivity size={22} />, color: "violet", sub: "Last 20 events" },
  ];

  return (
    <Box p="xl">
      <Stack gap="xl">
        <Box>
          <Title order={3} fw={600}>
            Welcome back, {user?.display_name}
          </Title>
          <Text c="dimmed" size="sm">
            Network overview &mdash;{" "}
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Text>
        </Box>

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        )}

        <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="md">
          {statCards.map((stat) =>
            loading ? (
              <Skeleton key={stat.label} h={110} radius="md" />
            ) : (
              <Paper key={stat.label} p="md" radius="md" withBorder bg="dark.7">
                <Group justify="space-between" mb="xs">
                  <ThemeIcon size={36} radius="md" color={stat.color} variant="light">
                    {stat.icon}
                  </ThemeIcon>
                </Group>
                <Text size="xl" fw={700}>
                  {stat.value}
                </Text>
                <Text size="sm" fw={500}>
                  {stat.label}
                </Text>
                <Text size="xs" c="dimmed">
                  {stat.sub}
                </Text>
              </Paper>
            )
          )}
        </SimpleGrid>

        <Grid gap="md">
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Paper p="lg" radius="md" withBorder bg="dark.7" h="100%">
              <Group justify="space-between" mb="md">
                <Title order={5} fw={600}>
                  Recent Events
                </Title>
                <Badge color="brand" variant="light" size="sm">
                  Live
                </Badge>
              </Group>
              {loading ? (
                <Stack gap="xs">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} h={36} radius="sm" />
                  ))}
                </Stack>
              ) : (data?.recent_events.length ?? 0) === 0 ? (
                <Text c="dimmed" size="sm" ta="center" py="xl">
                  No recent events
                </Text>
              ) : (
                <ScrollArea>
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Time</Table.Th>
                        <Table.Th>Device</Table.Th>
                        <Table.Th>Event</Table.Th>
                        <Table.Th>Severity</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {data!.recent_events.map((event) => (
                        <Table.Tr key={event.id}>
                          <Table.Td>
                            <Text size="xs" ff="monospace" c="dimmed">
                              {new Date(event.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" fw={500}>
                              {event.device_id}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{event.message}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge
                              size="sm"
                              color={SEVERITY_COLORS[event.severity] ?? "gray"}
                              variant="light"
                            >
                              {event.severity}
                            </Badge>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              )}
            </Paper>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 4 }}>
            <Stack gap="md">
              <Paper p="lg" radius="md" withBorder bg="dark.7">
                <Title order={5} fw={600} mb="md">
                  Device Health
                </Title>
                {loading ? (
                  <Skeleton h={140} radius="50%" mx="auto" w={140} />
                ) : (
                  <>
                    <Group justify="center">
                      <RingProgress
                        size={140}
                        thickness={14}
                        roundCaps
                        sections={[
                          { value: onlinePct, color: "green" },
                          { value: warnPct, color: "yellow" },
                          { value: offlinePct, color: "red" },
                        ]}
                        label={
                          <Text ta="center" size="xs" fw={600}>
                            {onlinePct}%
                            <br />
                            Online
                          </Text>
                        }
                      />
                    </Group>
                    <Stack gap="xs" mt="sm">
                      {[
                        { label: "Online", pct: onlinePct, color: "green" },
                        { label: "Warning", pct: warnPct, color: "yellow" },
                        { label: "Offline", pct: offlinePct, color: "red" },
                      ].map((s) => (
                        <Group key={s.label} justify="space-between">
                          <Group gap="xs">
                            <Box
                              w={10}
                              h={10}
                              style={{
                                borderRadius: 2,
                                background: `var(--mantine-color-${s.color}-6)`,
                              }}
                            />
                            <Text size="xs">{s.label}</Text>
                          </Group>
                          <Text size="xs" c="dimmed">
                            {s.pct}%
                          </Text>
                        </Group>
                      ))}
                    </Stack>
                  </>
                )}
              </Paper>

              <Paper p="lg" radius="md" withBorder bg="dark.7">
                <Title order={5} fw={600} mb="md">
                  Status Summary
                </Title>
                {loading ? (
                  <Stack gap="xs">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} h={24} radius="sm" />
                    ))}
                  </Stack>
                ) : (
                  <Stack gap="sm">
                    {[
                      { label: "Total Devices", value: total },
                      { label: "Total Users", value: data?.total_users ?? 0 },
                      { label: "Active Users", value: data?.active_users ?? 0 },
                    ].map((r) => (
                      <Group key={r.label} justify="space-between">
                        <Text size="sm">{r.label}</Text>
                        <Text size="sm" fw={600} c="brand">
                          {r.value}
                        </Text>
                      </Group>
                    ))}
                  </Stack>
                )}
              </Paper>
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Box>
  );
}


