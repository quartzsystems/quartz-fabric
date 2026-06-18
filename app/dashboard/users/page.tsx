"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  NativeSelect,
  Paper,
  PasswordInput,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
  Avatar,
  ScrollArea,
  ThemeIcon,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconPlus,
  IconTrash,
  IconEdit,
  IconSearch,
  IconUsers,
  IconShieldCheck,
  IconUser,
  IconEye,
  IconAlertCircle,
} from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { users as usersApi, type ApiUser } from "@/lib/api";

type Role = "admin" | "operator" | "viewer";

const ROLE_META: Record<Role, { color: string; icon: React.ReactNode }> = {
  admin: { color: "brand", icon: <IconShieldCheck size={12} /> },
  operator: { color: "blue", icon: <IconUser size={12} /> },
  viewer: { color: "gray", icon: <IconEye size={12} /> },
};

const ROLE_OPTIONS = [
  { label: "Admin - Full access", value: "admin" },
  { label: "Operator - Read & write", value: "operator" },
  { label: "Viewer - Read only", value: "viewer" },
];

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [userList, setUserList] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<ApiUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);

  const isAdmin = currentUser?.role === "admin";

  const loadUsers = useCallback(async () => {
    setError(null);
    try {
      const data = await usersApi.list();
      setUserList(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const createForm = useForm({
    initialValues: {
      display_name: "",
      username: "",
      email: "",
      password: "",
      role: "viewer" as Role,
    },
    validate: {
      display_name: (v) => (v.trim().length < 2 ? "Display name too short" : null),
      username: (v) =>
        v.trim().length < 3
          ? "Username must be at least 3 characters"
          : userList.some((u) => u.username === v.trim())
          ? "Username already taken"
          : null,
      email: (v) => (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "Invalid email address" : null),
      password: (v) => (v.length < 8 ? "Password must be at least 8 characters" : null),
    },
  });

  const editForm = useForm({
    initialValues: {
      display_name: "",
      email: "",
      role: "viewer" as Role,
      status: "active" as "active" | "inactive",
      password: "",
      confirm_password: "",
    },
    validate: {
      display_name: (v) => (v.trim().length < 2 ? "Display name too short" : null),
      email: (v) => (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "Invalid email address" : null),
      password: (v) => (v.length > 0 && v.length < 8 ? "Must be at least 8 characters" : null),
      confirm_password: (v, values) =>
        values.password.length > 0 && v !== values.password ? "Passwords do not match" : null,
    },
  });

  const filtered = userList.filter(
    (u) =>
      u.display_name.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (values: typeof createForm.values) => {
    setSubmitting(true);
    try {
      await usersApi.create({
        display_name: values.display_name,
        username: values.username,
        email: values.email,
        password: values.password,
        role: values.role,
      });
      createForm.reset();
      closeCreate();
      notifications.show({
        title: "User created",
        message: `${values.display_name} has been added.`,
        color: "green",
      });
      loadUsers();
    } catch (e) {
      notifications.show({
        title: "Error",
        message: e instanceof Error ? e.message : "Failed to create user",
        color: "red",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditOpen = (u: ApiUser) => {
    setEditTarget(u);
    editForm.setValues({
      display_name: u.display_name,
      email: u.email,
      role: u.role as Role,
      status: u.status as "active" | "inactive",
      password: "",
      confirm_password: "",
    });
    openEdit();
  };

  const handleEdit = async (values: typeof editForm.values) => {
    if (!editTarget) return;
    setSubmitting(true);
    try {
      const payload: Parameters<typeof usersApi.update>[1] = {
        display_name: values.display_name,
        email: values.email,
        role: values.role,
        status: values.status,
      };
      if (values.password) payload.password = values.password;
      await usersApi.update(editTarget.id, payload);
      closeEdit();
      notifications.show({
        title: "User updated",
        message: `${values.display_name} has been updated.`,
        color: "blue",
      });
      loadUsers();
    } catch (e) {
      notifications.show({
        title: "Error",
        message: e instanceof Error ? e.message : "Failed to update user",
        color: "red",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOpen = (u: ApiUser) => {
    setDeleteTarget(u);
    openDelete();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await usersApi.delete(deleteTarget.id);
      closeDelete();
      notifications.show({
        title: "User removed",
        message: `${deleteTarget.display_name} has been removed.`,
        color: "red",
      });
      loadUsers();
    } catch (e) {
      notifications.show({
        title: "Error",
        message: e instanceof Error ? e.message : "Failed to delete user",
        color: "red",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const stats = {
    total: userList.length,
    active: userList.filter((u) => u.status === "active").length,
    admins: userList.filter((u) => u.role === "admin").length,
  };

  return (
    <Box p="xl">
      <Stack gap="xl">
        <Group justify="space-between">
          <Box>
            <Title order={3} fw={600}>
              User Management
            </Title>
            <Text c="dimmed" size="sm">
              Manage platform users and access roles
            </Text>
          </Box>
          {isAdmin && (
            <Button leftSection={<IconPlus size={16} />} color="brand" onClick={openCreate}>
              Add User
            </Button>
          )}
        </Group>

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        )}

        <Group gap="md">
          {loading ? (
            <>
              <Skeleton h={72} flex={1} radius="md" />
              <Skeleton h={72} flex={1} radius="md" />
              <Skeleton h={72} flex={1} radius="md" />
            </>
          ) : (
            [
              { label: "Total Users", value: stats.total, color: "brand", icon: <IconUsers size={16} /> },
              { label: "Active", value: stats.active, color: "green", icon: <IconUser size={16} /> },
              { label: "Admins", value: stats.admins, color: "blue", icon: <IconShieldCheck size={16} /> },
            ].map((s) => (
              <Paper key={s.label} px="lg" py="md" radius="md" withBorder bg="dark.7" flex={1}>
                <Group gap="sm">
                  <ThemeIcon size={32} radius="sm" color={s.color} variant="light">
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
        </Group>

        <Paper radius="md" withBorder bg="dark.7">
          <Box p="md">
            <TextInput
              placeholder="Search users by name, username, or email..."
              leftSection={<IconSearch size={16} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              w={{ base: "100%", sm: 360 }}
            />
          </Box>
          <Divider />
          <ScrollArea>
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>User</Table.Th>
                  <Table.Th>Username</Table.Th>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Last Login</Table.Th>
                  {isAdmin && <Table.Th style={{ textAlign: "right" }}>Actions</Table.Th>}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <Table.Tr key={i}>
                      <Table.Td colSpan={isAdmin ? 6 : 5}>
                        <Skeleton h={28} radius="sm" />
                      </Table.Td>
                    </Table.Tr>
                  ))
                ) : filtered.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={isAdmin ? 6 : 5}>
                      <Text c="dimmed" ta="center" py="xl" size="sm">
                        {search ? "No users match your search" : "No users found"}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  filtered.map((u) => (
                    <Table.Tr key={u.id}>
                      <Table.Td>
                        <Group gap="sm">
                          <Avatar size="sm" color="brand" radius="xl">
                            {u.display_name.charAt(0)}
                          </Avatar>
                          <Box>
                            <Text size="sm" fw={500}>
                              {u.display_name}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {u.email}
                            </Text>
                          </Box>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" ff="monospace">
                          {u.username}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          size="sm"
                          color={ROLE_META[u.role as Role]?.color ?? "gray"}
                          leftSection={ROLE_META[u.role as Role]?.icon}
                          variant="light"
                        >
                          {u.role}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          size="sm"
                          color={u.status === "active" ? "green" : "gray"}
                          variant="dot"
                        >
                          {u.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed" ff="monospace">
                          {u.last_login
                            ? new Date(u.last_login).toLocaleString([], {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "Never"}
                        </Text>
                      </Table.Td>
                      {isAdmin && (
                        <Table.Td>
                          <Group gap={4} justify="flex-end">
                            <Tooltip label="Edit user">
                              <ActionIcon
                                variant="light"
                                color="blue"
                                size="sm"
                                onClick={() => handleEditOpen(u)}
                                disabled={u.id === currentUser?.id}
                              >
                                <IconEdit size={14} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Delete user">
                              <ActionIcon
                                variant="light"
                                color="red"
                                size="sm"
                                onClick={() => handleDeleteOpen(u)}
                                disabled={u.id === currentUser?.id}
                              >
                                <IconTrash size={14} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Table.Td>
                      )}
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      </Stack>

      {/* Create User Modal */}
      <Modal opened={createOpened} onClose={closeCreate} title="Add New User" centered>
        <form onSubmit={createForm.onSubmit(handleCreate)}>
          <Stack gap="md">
            <TextInput
              label="Display Name"
              placeholder="John Smith"
              {...createForm.getInputProps("display_name")}
            />
            <TextInput
              label="Username"
              placeholder="jsmith"
              {...createForm.getInputProps("username")}
            />
            <TextInput
              label="Email"
              placeholder="jsmith@quartz.systems"
              {...createForm.getInputProps("email")}
            />
            <PasswordInput
              label="Password"
              placeholder="Minimum 8 characters"
              {...createForm.getInputProps("password")}
            />
            <NativeSelect
              label="Role"
              data={ROLE_OPTIONS}
              {...createForm.getInputProps("role")}
            />
            <Group justify="flex-end" mt="sm">
              <Button variant="default" onClick={closeCreate} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" color="brand" loading={submitting}>
                Create User
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        opened={editOpened}
        onClose={closeEdit}
        title={"Edit User" + (editTarget ? " - " + editTarget.username : "")}
        centered
        size="md"
      >
        <form onSubmit={editForm.onSubmit(handleEdit)}>
          <Stack gap="md">
            <TextInput label="Display Name" {...editForm.getInputProps("display_name")} />
            <TextInput label="Email" {...editForm.getInputProps("email")} />
            <NativeSelect
              label="Role"
              data={ROLE_OPTIONS}
              {...editForm.getInputProps("role")}
            />
            <NativeSelect
              label="Status"
              data={[
                { label: "Active", value: "active" },
                { label: "Inactive", value: "inactive" },
              ]}
              {...editForm.getInputProps("status")}
            />
            <Divider label="Reset Password (optional)" labelPosition="left" />
            <PasswordInput
              label="New Password"
              placeholder="Leave blank to keep current password"
              {...editForm.getInputProps("password")}
            />
            <PasswordInput
              label="Confirm Password"
              placeholder="Repeat new password"
              {...editForm.getInputProps("confirm_password")}
            />
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
      <Modal opened={deleteOpened} onClose={closeDelete} title="Remove User" centered size="sm">
        <Text size="sm" mb="lg">
          Are you sure you want to remove{" "}
          <strong>{deleteTarget?.display_name}</strong>? This action cannot be undone.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={closeDelete} disabled={submitting}>
            Cancel
          </Button>
          <Button color="red" onClick={handleDelete} loading={submitting}>
            Remove User
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}
