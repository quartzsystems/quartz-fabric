"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  AppShell,
  Burger,
  Center,
  Group,
  Loader,
  NavLink,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Avatar,
  Menu,
  Divider,
  Badge,
  Box,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconNetwork,
  IconUsers,
  IconDeviceDesktopAnalytics,
  IconLayoutDashboard,
  IconChevronRight,
  IconLogout,
  IconSettings,
  IconUser,
  IconShieldCheck,
} from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import type { ReactNode } from "react";

const ROLE_COLORS: Record<string, string> = {
  admin: "brand",
  operator: "blue",
  viewer: "gray",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [opened, { toggle }] = useDisclosure();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <Center h="100vh">
        <Loader size="lg" color="brand" />
      </Center>
    );
  }

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const navItems = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: <IconLayoutDashboard size={18} />,
      description: "Overview & stats",
      exact: true,
    },
    {
      label: "Devices",
      href: "/dashboard/devices",
      icon: <IconDeviceDesktopAnalytics size={18} />,
      description: "Switch inventory",
    },
    {
      label: "Users",
      href: "/dashboard/users",
      icon: <IconUsers size={18} />,
      description: "User management",
      adminOnly: true,
    },
  ];

  const secondaryNavItems = [
    {
      label: "Settings",
      href: "/dashboard/settings",
      icon: <IconSettings size={18} />,
      description: "System configuration",
    },
  ];

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding={0}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Group gap="xs">
              <ThemeIcon size={32} radius="sm" color="brand" variant="filled">
                <IconNetwork size={18} />
              </ThemeIcon>
              <Box>
                <Title order={5} c="brand" fw={700} lts={0.5} lh={1.1}>
                  QUARTZ FABRIC
                </Title>
                <Text size="10px" c="dimmed" lts={1.5} tt="uppercase">
                  Network Management
                </Text>
              </Box>
            </Group>
          </Group>

          <Group gap="sm">
            <Menu shadow="md" width={220} position="bottom-end">
              <Menu.Target>
                <Group gap="xs" style={{ cursor: "pointer" }}>
                  <Avatar size="sm" color="brand" radius="xl">
                    {user.display_name.charAt(0)}
                  </Avatar>
                  <Box visibleFrom="sm">
                    <Text size="sm" fw={500} lh={1.2}>
                      {user.display_name}
                    </Text>
                    <Badge size="xs" color={ROLE_COLORS[user.role]} variant="light">
                      {user.role}
                    </Badge>
                  </Box>
                  <IconChevronRight size={14} style={{ color: "var(--mantine-color-dimmed)" }} />
                </Group>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>
                  <Text size="xs" c="dimmed">
                    {user.email}
                  </Text>
                </Menu.Label>
                <Menu.Divider />
                <Menu.Item
                  component={Link}
                  href="/dashboard/profile"
                  leftSection={<IconUser size={14} />}
                >
                  My Profile
                </Menu.Item>
                <Menu.Item
                  component={Link}
                  href="/dashboard/settings"
                  leftSection={<IconSettings size={14} />}
                >
                  Settings
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<IconLogout size={14} />}
                  onClick={handleLogout}
                >
                  Sign Out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <Stack gap={4} mt="xs" style={{ flex: 1 }}>
          {navItems
            .filter((item) => !item.adminOnly || user.role === "admin")
            .map((item) => (
              <NavLink
                key={item.href}
                component={Link}
                href={item.href}
                label={item.label}
                description={item.description}
                leftSection={
                  <ThemeIcon
                    size={30}
                    radius="sm"
                    variant={isActive(item.href, item.exact) ? "filled" : "light"}
                    color="brand"
                  >
                    {item.icon}
                  </ThemeIcon>
                }
                active={isActive(item.href, item.exact)}
                color="brand"
                styles={{ root: { borderRadius: "var(--mantine-radius-md)" } }}
              />
            ))}

          <Divider my={4} />

          {secondaryNavItems.map((item) => (
            <NavLink
              key={item.href}
              component={Link}
              href={item.href}
              label={item.label}
              description={item.description}
              leftSection={
                <ThemeIcon
                  size={30}
                  radius="sm"
                  variant={isActive(item.href) ? "filled" : "light"}
                  color="brand"
                >
                  {item.icon}
                </ThemeIcon>
              }
              active={isActive(item.href)}
              color="brand"
              styles={{ root: { borderRadius: "var(--mantine-radius-md)" } }}
            />
          ))}
        </Stack>

        <Box pb="sm">
          <Divider mb="sm" />
          <Group px="xs" gap="xs">
            <ThemeIcon size={24} radius="sm" color="green" variant="light">
              <IconShieldCheck size={14} />
            </ThemeIcon>
            <Text size="xs" c="dimmed">
              Secure session active
            </Text>
          </Group>
        </Box>
      </AppShell.Navbar>

      <AppShell.Main bg="dark.8">{children}</AppShell.Main>
    </AppShell>
  );
}
