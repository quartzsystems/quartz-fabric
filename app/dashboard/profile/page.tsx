"use client";

import { useState } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconCheck, IconLock, IconUser } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { auth } from "@/lib/api";

const ROLE_COLORS: Record<string, string> = {
  admin: "brand",
  operator: "blue",
  viewer: "gray",
};

export default function ProfilePage() {
  const { user, login } = useAuth();
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const profileForm = useForm({
    initialValues: {
      display_name: user?.display_name ?? "",
      email: user?.email ?? "",
    },
    validate: {
      display_name: (v) => (v.trim().length < 2 ? "Display name too short" : null),
      email: (v) => (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "Invalid email" : null),
    },
  });

  const passwordForm = useForm({
    initialValues: {
      password: "",
      confirm: "",
    },
    validate: {
      password: (v) => (v.length < 8 ? "Must be at least 8 characters" : null),
      confirm: (v, values) => (v !== values.password ? "Passwords do not match" : null),
    },
  });

  const handleProfileSave = async (values: typeof profileForm.values) => {
    setProfileError(null);
    setProfileLoading(true);
    try {
      await auth.updateMe({
        display_name: values.display_name,
        email: values.email,
      });
      notifications.show({
        title: "Profile updated",
        message: "Your profile has been saved.",
        color: "green",
        icon: <IconCheck size={16} />,
      });
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Failed to update profile");
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSave = async (values: typeof passwordForm.values) => {
    setPasswordError(null);
    setPasswordLoading(true);
    try {
      await auth.updateMe({ password: values.password });
      passwordForm.reset();
      notifications.show({
        title: "Password changed",
        message: "Your password has been updated.",
        color: "green",
        icon: <IconCheck size={16} />,
      });
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : "Failed to change password");
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Box p="xl" maw={680}>
      <Stack gap="xl">
        <Box>
          <Title order={3} fw={600}>
            My Profile
          </Title>
          <Text c="dimmed" size="sm">
            Manage your account information and password
          </Text>
        </Box>

        {/* Identity card */}
        <Paper p="lg" radius="md" withBorder bg="dark.7">
          <Group gap="lg">
            <Avatar size={72} color="brand" radius="xl" fw={700} fz="xl">
              {user.display_name.charAt(0).toUpperCase()}
            </Avatar>
            <Box>
              <Text fw={600} size="lg">
                {user.display_name}
              </Text>
              <Text size="sm" c="dimmed">
                @{user.username}
              </Text>
              <Group gap="xs" mt={6}>
                <Badge color={ROLE_COLORS[user.role] ?? "gray"} variant="light" size="sm">
                  {user.role}
                </Badge>
                <Badge color={user.status === "active" ? "green" : "gray"} variant="dot" size="sm">
                  {user.status}
                </Badge>
              </Group>
            </Box>
          </Group>
          <Divider my="md" />
          <Group gap="xl">
            <Box>
              <Text size="xs" c="dimmed">
                Member since
              </Text>
              <Text size="sm" fw={500}>
                {new Date(user.created_at).toLocaleDateString()}
              </Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">
                Last login
              </Text>
              <Text size="sm" fw={500}>
                {user.last_login
                  ? new Date(user.last_login).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "—"}
              </Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">
                Username
              </Text>
              <Text size="sm" fw={500} ff="monospace">
                {user.username}
              </Text>
            </Box>
          </Group>
        </Paper>

        {/* Profile info edit */}
        <Paper p="lg" radius="md" withBorder bg="dark.7">
          <Group gap="xs" mb="md">
            <IconUser size={18} />
            <Title order={5} fw={600}>
              Profile Information
            </Title>
          </Group>

          {profileError && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light" mb="md">
              {profileError}
            </Alert>
          )}

          <form onSubmit={profileForm.onSubmit(handleProfileSave)}>
            <Stack gap="md">
              <TextInput
                label="Display Name"
                {...profileForm.getInputProps("display_name")}
              />
              <TextInput
                label="Email Address"
                {...profileForm.getInputProps("email")}
              />
              <TextInput
                label="Username"
                value={user.username}
                disabled
                description="Username cannot be changed"
              />
              <Group justify="flex-end">
                <Button type="submit" color="brand" loading={profileLoading}>
                  Save Profile
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>

        {/* Password change */}
        <Paper p="lg" radius="md" withBorder bg="dark.7">
          <Group gap="xs" mb="md">
            <IconLock size={18} />
            <Title order={5} fw={600}>
              Change Password
            </Title>
          </Group>

          {passwordError && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light" mb="md">
              {passwordError}
            </Alert>
          )}

          <form onSubmit={passwordForm.onSubmit(handlePasswordSave)}>
            <Stack gap="md">
              <PasswordInput
                label="New Password"
                placeholder="Minimum 8 characters"
                {...passwordForm.getInputProps("password")}
              />
              <PasswordInput
                label="Confirm New Password"
                placeholder="Repeat new password"
                {...passwordForm.getInputProps("confirm")}
              />
              <Group justify="flex-end">
                <Button
                  variant="default"
                  onClick={() => passwordForm.reset()}
                  disabled={passwordLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" color="brand" loading={passwordLoading}>
                  Change Password
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Box>
  );
}
