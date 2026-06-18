"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Center,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
  ThemeIcon,
  Alert,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconNetwork, IconAlertCircle, IconLock, IconUser } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  const form = useForm({
    initialValues: { username: "", password: "" },
    validate: {
      username: (v) => (v.trim().length === 0 ? "Username is required" : null),
      password: (v) => (v.length === 0 ? "Password is required" : null),
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    setError(null);
    setLoading(true);
    try {
      await login(values.username, values.password);
      router.replace("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center h="100vh" bg="dark.9">
      <Box w={{ base: "90%", sm: 420 }}>
        <Stack align="center" mb="xl" gap="xs">
          <Group gap="sm">
            <ThemeIcon size={48} radius="md" color="brand" variant="filled">
              <IconNetwork size={28} />
            </ThemeIcon>
            <Box>
              <Title order={2} c="brand" fw={700} lts={1}>
                QUARTZ FABRIC
              </Title>
              <Text size="xs" c="dimmed" lts={2} tt="uppercase">
                Network Management Platform
              </Text>
            </Box>
          </Group>
        </Stack>

        <Paper p="xl" radius="md" bg="dark.7" withBorder>
          <Title order={4} mb="xs" fw={600}>
            Sign in
          </Title>
          <Text size="sm" c="dimmed" mb="lg">
            Dell OS9 Switch Management Console
          </Text>

          {error && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color="red"
              mb="md"
              radius="md"
              variant="light"
            >
              {error}
            </Alert>
          )}

          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="md">
              <TextInput
                label="Username"
                placeholder="Enter your username"
                leftSection={<IconUser size={16} />}
                {...form.getInputProps("username")}
                autoComplete="username"
              />
              <PasswordInput
                label="Password"
                placeholder="Enter your password"
                leftSection={<IconLock size={16} />}
                {...form.getInputProps("password")}
                autoComplete="current-password"
              />
              <Button
                type="submit"
                fullWidth
                color="brand"
                loading={loading}
                mt="xs"
                size="md"
              >
                Sign In
              </Button>
            </Stack>
          </form>

        </Paper>

        <Text size="xs" c="dimmed" ta="center" mt="md">
          Â© {new Date().getFullYear()} Quartz Systems &mdash; All rights reserved
        </Text>
      </Box>
    </Center>
  );
}


