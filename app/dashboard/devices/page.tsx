"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Group,
  Modal,
  NativeSelect,
  NumberInput,
  Paper,
  PasswordInput,
  ScrollArea,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
  IconDeviceDesktopAnalytics,
  IconEdit,
  IconKey,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconServer,
  IconTrash,
  IconWifi,
  IconWifiOff,
} from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { devices as devicesApi, type ApiDevice } from "@/lib/api";

type DeviceStatus = "online" | "offline" | "warning" | "unknown";

const STATUS_META: Record<DeviceStatus, { color: string; icon: React.ReactNode; label: string }> = {
  online: { color: "green", icon: <IconWifi size={13} />, label: "Online" },
  offline: { color: "red", icon: <IconWifiOff size={13} />, label: "Offline" },
  warning: { color: "yellow", icon: <IconAlertTriangle size={13} />, label: "Warning" },
  unknown: { color: "gray", icon: <IconServer size={13} />, label: "Unknown" },
};

const ROLE_COLORS: Record<string, string> = {
  core: "brand",
  distribution: "blue",
  access: "grape",
  edge: "orange",
};

export default function DevicesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canEdit = user?.role !== "viewer";

  const [deviceList, setDeviceList] = useState<ApiDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<ApiDevice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiDevice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false);
  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);

  const loadDevices = useCallback(async () => {
    setError(null);
    try {
      const data = await devicesApi.list();
      setDeviceList(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const addForm = useForm({
    initialValues: {
      hostname: "",
      ip_address: "",
      location: "",
      role: "access" as ApiDevice["role"],
      ssh_username: "",
      ssh_password: "",
      ssh_port: 22,
    },
    validate: {
      hostname: (v) => (v.trim().length < 2 ? "Hostname required" : null),
      ip_address: (v) => (/^(\d{1,3}\.){3}\d{1,3}$/.test(v) ? null : "Invalid IP address"),
      location: (v) => (v.trim().length < 2 ? "Location required" : null),
      ssh_username: (v) => (v.trim().length < 1 ? "SSH username required" : null),
      ssh_password: (v) => (v.length < 1 ? "SSH password required" : null),
    },
  });

  const editForm = useForm({
    initialValues: {
      hostname: "",
      ip_address: "",
      location: "",
      role: "access" as ApiDevice["role"],
      ssh_username: "",
      ssh_password: "",
      ssh_port: 22,
    },
    validate: {
      hostname: (v) => (v.trim().length < 2 ? "Hostname required" : null),
      ip_address: (v) => (/^(\d{1,3}\.){3}\d{1,3}$/.test(v) ? null : "Invalid IP address"),
      location: (v) => (v.trim().length < 2 ? "Location required" : null),
    },
  });

  const filtered = deviceList.filter((d) => {
    const matchSearch =
      d.hostname.toLowerCase().includes(search.toLowerCase()) ||
      d.ip_address.includes(search) ||
      (d.model ?? "").toLowerCase().includes(search.toLowerCase()) ||
      d.location.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    const matchRole = roleFilter === "all" || d.role === roleFilter;
    return matchSearch && matchStatus && matchRole;
  });

  const stats = {
    total: deviceList.length,
    online: deviceList.filter((d) => d.status === "online").length,
    offline: deviceList.filter((d) => d.status === "offline").length,
    warning: deviceList.filter((d) => d.status === "warning").length,
  };

  const handleAdd = async (values: typeof addForm.values) => {
    setSubmitting(true);
    try {
      await devicesApi.create({
        hostname: values.hostname,
        ip_address: values.ip_address,
        location: values.location,
        role: values.role,
        ssh_username: values.ssh_username,
        ssh_password: values.ssh_password,
        ssh_port: values.ssh_port,
      });
      addForm.reset();
      closeAdd();
      notifications.show({ title: "Device added", message: `${values.hostname} added to inventory.`, color: "green" });
      loadDevices();
    } catch (e) {
      notifications.show({ title: "Error", message: e instanceof Error ? e.message : "Failed to add device", color: "red" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditOpen = (d: ApiDevice) => {
    setEditTarget(d);
    editForm.setValues({
      hostname: d.hostname,
      ip_address: d.ip_address,
      location: d.location,
      role: d.role,
      ssh_username: "",
      ssh_password: "",
      ssh_port: d.ssh_port,
    });
    openEdit();
  };

  const handleEdit = async (values: typeof editForm.values) => {
    if (!editTarget) return;
    setSubmitting(true);
    try {
      const payload: Parameters<typeof devicesApi.update>[1] = {
        hostname: values.hostname,
        ip_address: values.ip_address,
        location: values.location,
        role: values.role,
        ssh_port: values.ssh_port,
      };
      if (values.ssh_username) payload.ssh_username = values.ssh_username;
      if (values.ssh_password) payload.ssh_password = values.ssh_password;
      await devicesApi.update(editTarget.id, payload);
      closeEdit();
      notifications.show({ title: "Device updated", message: `${values.hostname} updated.`, color: "blue" });
      loadDevices();
    } catch (e) {
      notifications.show({ title: "Error", message: e instanceof Error ? e.message : "Failed to update device", color: "red" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOpen = (d: ApiDevice) => {
    setDeleteTarget(d);
    openDelete();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await devicesApi.delete(deleteTarget.id);
      closeDelete();
      notifications.show({ title: "Device removed", message: `${deleteTarget.hostname} removed.`, color: "red" });
      loadDevices();
    } catch (e) {
      notifications.show({ title: "Error", message: e instanceof Error ? e.message : "Failed to delete device", color: "red" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = async (id: string) => {
    setRefreshingId(id);
    try {
      await devicesApi.refresh(id);
      notifications.show({ title: "Polling queued", message: "Device will be polled shortly.", color: "brand", autoClose: 3000 });
      setTimeout(loadDevices, 5000);
    } catch (e) {
      notifications.show({ title: "Error", message: e instanceof Error ? e.message : "Failed to refresh", color: "red" });
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <Box p="xl">
      <Stack gap="xl">
        <Group justify="space-between">
          <Box>
            <Title order={3} fw={600}>
              Devices &amp; Inventory
            </Title>
            <Text c="dimmed" size="sm">
              Dell OS9 switch inventory and status
            </Text>
          </Box>
          {canEdit && (
            <Button leftSection={<IconPlus size={16} />} color="brand" onClick={openAdd}>
              Add Device
            </Button>
          )}
        </Group>

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        )}

        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={72} radius="md" />)
          ) : (
            [
              { label: "Total Devices", value: stats.total, color: "brand", icon: <IconDeviceDesktopAnalytics size={18} /> },
              { label: "Online", value: stats.online, color: "green", icon: <IconWifi size={18} /> },
              { label: "Offline", value: stats.offline, color: "red", icon: <IconWifiOff size={18} /> },
              { label: "Warning", value: stats.warning, color: "yellow", icon: <IconAlertTriangle size={18} /> },
            ].map((s) => (
              <Paper key={s.label} p="md" radius="md" withBorder bg="dark.7">
                <Group gap="sm">
                  <ThemeIcon size={36} radius="md" color={s.color} variant="light">
                    {s.icon}
                  </ThemeIcon>
                  <Box>
                    <Text size="xl" fw={700}>
                      {s.value}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {s.label}
                    </Text>
                  </Box>
                </Group>
              </Paper>
            ))
          )}
        </SimpleGrid>

        <Paper radius="md" withBorder bg="dark.7">
          <Box p="md">
            <Group>
              <TextInput
                placeholder="Search hostname, IP, model, location..."
                leftSection={<IconSearch size={16} />}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                flex={1}
                miw={200}
              />
              <NativeSelect
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.currentTarget.value)}
                data={[
                  { label: "All Statuses", value: "all" },
                  { label: "Online", value: "online" },
                  { label: "Warning", value: "warning" },
                  { label: "Offline", value: "offline" },
                  { label: "Unknown", value: "unknown" },
                ]}
                w={160}
              />
              <NativeSelect
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.currentTarget.value)}
                data={[
                  { label: "All Roles", value: "all" },
                  { label: "Core", value: "core" },
                  { label: "Distribution", value: "distribution" },
                  { label: "Access", value: "access" },
                  { label: "Edge", value: "edge" },
                ]}
                w={160}
              />
            </Group>
          </Box>
          <Divider />
          <ScrollArea>
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={32} />
                  <Table.Th>Hostname</Table.Th>
                  <Table.Th>IP Address</Table.Th>
                  <Table.Th>Model</Table.Th>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>OS Version</Table.Th>
                  <Table.Th>Location</Table.Th>
                  <Table.Th style={{ textAlign: "right" }}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Table.Tr key={i}>
                      <Table.Td colSpan={9}>
                        <Skeleton h={28} radius="sm" />
                      </Table.Td>
                    </Table.Tr>
                  ))
                ) : filtered.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={9}>
                      <Text c="dimmed" ta="center" py="xl" size="sm">
                        {search || statusFilter !== "all" || roleFilter !== "all"
                          ? "No devices match your filter"
                          : "No devices found â€” add your first device to get started"}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  filtered.map((device) => {
                    const statusMeta = STATUS_META[device.status as DeviceStatus] ?? STATUS_META.unknown;
                    return (
                      <>
                        <Table.Tr key={device.id} style={{ cursor: "pointer" }}>
                          <Table.Td>
                            <ActionIcon
                              variant="subtle"
                              size="xs"
                              color="gray"
                              onClick={() =>
                                setExpandedId((prev) => (prev === device.id ? null : device.id))
                              }
                            >
                              {expandedId === device.id ? (
                                <IconChevronUp size={14} />
                              ) : (
                                <IconChevronDown size={14} />
                              )}
                            </ActionIcon>
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs">
                              <ThemeIcon
                                size={22}
                                radius="sm"
                                color={ROLE_COLORS[device.role] ?? "gray"}
                                variant="light"
                              >
                                <IconServer size={12} />
                              </ThemeIcon>
                              <Text size="sm" fw={500} ff="monospace">
                                {device.hostname}
                              </Text>
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" ff="monospace">
                              {device.ip_address}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{device.model ?? "â€”"}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge size="sm" color={ROLE_COLORS[device.role] ?? "gray"} variant="light">
                              {device.role}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Badge
                              size="sm"
                              color={statusMeta.color}
                              leftSection={statusMeta.icon}
                              variant="light"
                            >
                              {statusMeta.label}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs" ff="monospace" c="dimmed">
                              {device.os_version ?? "â€”"}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{device.location}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Group gap={4} justify="flex-end">
                              <Tooltip label="Refresh status">
                                <ActionIcon
                                  variant="light"
                                  color="brand"
                                  size="sm"
                                  onClick={() => handleRefresh(device.id)}
                                  loading={refreshingId === device.id}
                                >
                                  <IconRefresh size={13} />
                                </ActionIcon>
                              </Tooltip>
                              {canEdit && (
                                <Tooltip label="Edit device">
                                  <ActionIcon
                                    variant="light"
                                    color="blue"
                                    size="sm"
                                    onClick={() => handleEditOpen(device)}
                                  >
                                    <IconEdit size={13} />
                                  </ActionIcon>
                                </Tooltip>
                              )}
                              {isAdmin && (
                                <Tooltip label="Remove device">
                                  <ActionIcon
                                    variant="light"
                                    color="red"
                                    size="sm"
                                    onClick={() => handleDeleteOpen(device)}
                                  >
                                    <IconTrash size={13} />
                                  </ActionIcon>
                                </Tooltip>
                              )}
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                        {expandedId === device.id && (
                          <Table.Tr key={`${device.id}-detail`} bg="dark.8">
                            <Table.Td colSpan={9} p="md">
                              <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
                                {[
                                  { label: "Serial Number", value: device.serial_number ?? "â€”", mono: true },
                                  { label: "Port Count", value: device.port_count != null ? `${device.port_count} ports` : "â€”", mono: false },
                                  { label: "Uptime", value: device.uptime ?? "â€”", mono: true },
                                  {
                                    label: "Last Seen",
                                    value: device.last_seen
                                      ? new Date(device.last_seen).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
                                      : "Never",
                                    mono: true,
                                  },
                                ].map((detail) => (
                                  <Box key={detail.label}>
                                    <Text size="xs" c="dimmed" mb={2}>
                                      {detail.label}
                                    </Text>
                                    {detail.mono ? (
                                      <Code>{detail.value}</Code>
                                    ) : (
                                      <Text size="sm" fw={500}>
                                        {detail.value}
                                      </Text>
                                    )}
                                  </Box>
                                ))}
                                {device.status !== "offline" && device.status !== "unknown" && (
                                  <>
                                    <Box>
                                      <Text size="xs" c="dimmed" mb={2}>
                                        CPU Usage
                                      </Text>
                                      <Badge
                                        color={
                                          device.cpu_pct != null && device.cpu_pct > 80
                                            ? "red"
                                            : device.cpu_pct != null && device.cpu_pct > 60
                                            ? "yellow"
                                            : "green"
                                        }
                                        variant="light"
                                      >
                                        {device.cpu_pct != null ? `${device.cpu_pct}%` : "â€”"}
                                      </Badge>
                                    </Box>
                                    <Box>
                                      <Text size="xs" c="dimmed" mb={2}>
                                        Memory Usage
                                      </Text>
                                      <Badge
                                        color={
                                          device.mem_pct != null && device.mem_pct > 80
                                            ? "red"
                                            : device.mem_pct != null && device.mem_pct > 60
                                            ? "yellow"
                                            : "green"
                                        }
                                        variant="light"
                                      >
                                        {device.mem_pct != null ? `${device.mem_pct}%` : "â€”"}
                                      </Badge>
                                    </Box>
                                  </>
                                )}
                              </SimpleGrid>
                            </Table.Td>
                          </Table.Tr>
                        )}
                      </>
                    );
                  })
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      </Stack>

      {/* Add Device Modal */}
      <Modal opened={addOpened} onClose={closeAdd} title="Add Device" centered size="md">
        <form onSubmit={addForm.onSubmit(handleAdd)}>
          <Stack gap="md">
            <TextInput label="Hostname" placeholder="ACCESS-SW-10" {...addForm.getInputProps("hostname")} />
            <TextInput label="IP Address" placeholder="10.0.2.10" {...addForm.getInputProps("ip_address")} />
            <NativeSelect
              label="Role"
              data={[
                { label: "Core", value: "core" },
                { label: "Distribution", value: "distribution" },
                { label: "Access", value: "access" },
                { label: "Edge", value: "edge" },
              ]}
              {...addForm.getInputProps("role")}
            />
            <TextInput label="Location" placeholder="DC1 - Rack C10" {...addForm.getInputProps("location")} />
            <Divider label={<Group gap={4}><IconKey size={12} />SSH Credentials</Group>} labelPosition="left" />
            <TextInput label="SSH Username" placeholder="admin" {...addForm.getInputProps("ssh_username")} />
            <PasswordInput label="SSH Password" placeholder="Switch enable password" {...addForm.getInputProps("ssh_password")} />
            <NumberInput label="SSH Port" min={1} max={65535} {...addForm.getInputProps("ssh_port")} />
            <Group justify="flex-end" mt="sm">
              <Button variant="default" onClick={closeAdd} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" color="brand" loading={submitting}>
                Add Device
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Edit Device Modal */}
      <Modal opened={editOpened} onClose={closeEdit} title="Edit Device" centered size="md">
        <form onSubmit={editForm.onSubmit(handleEdit)}>
          <Stack gap="md">
            <TextInput label="Hostname" {...editForm.getInputProps("hostname")} />
            <TextInput label="IP Address" {...editForm.getInputProps("ip_address")} />
            <TextInput label="Location" {...editForm.getInputProps("location")} />
            <NativeSelect
              label="Role"
              data={[
                { label: "Core", value: "core" },
                { label: "Distribution", value: "distribution" },
                { label: "Access", value: "access" },
                { label: "Edge", value: "edge" },
              ]}
              {...editForm.getInputProps("role")}
            />
            <Divider label={<Group gap={4}><IconKey size={12} />Update SSH Credentials (leave blank to keep existing)</Group>} labelPosition="left" />
            <TextInput label="SSH Username" placeholder="Leave blank to keep current" {...editForm.getInputProps("ssh_username")} />
            <PasswordInput label="SSH Password" placeholder="Leave blank to keep current" {...editForm.getInputProps("ssh_password")} />
            <NumberInput label="SSH Port" min={1} max={65535} {...editForm.getInputProps("ssh_port")} />
            <Group justify="flex-end" mt="sm">
              <Button variant="default" onClick={closeEdit} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" color="blue" loading={submitting}>
                Save Changes
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal opened={deleteOpened} onClose={closeDelete} title="Remove Device" centered size="sm">
        <Text size="sm" mb="lg">
          Are you sure you want to remove <strong>{deleteTarget?.hostname}</strong> (
          {deleteTarget?.ip_address}) from inventory? This action cannot be undone.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={closeDelete} disabled={submitting}>
            Cancel
          </Button>
          <Button color="red" onClick={handleDelete} loading={submitting}>
            Remove Device
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}


