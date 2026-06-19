# Quartz Fabric

Centralized management platform for Dell OS9 network switches. Provides a single web UI for device inventory, real-time status monitoring, interface and VLAN configuration, configuration template deployment, and role-based user access control.

## Tech Stack

**Frontend** — Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4  
**Backend** — Rust · Axum · SQLite (via SQLx) · JWT authentication · russh (pure-Rust SSH2)

## Prerequisites

- Node.js 20+
- Rust toolchain (stable, 2021 edition)

## Development Setup

### Backend

```bash
cd backend
# Copy and edit the environment file — JWT_SECRET is required
cp .env.example .env
cargo run
```

The API server starts on `http://0.0.0.0:8080` by default. On first start, if no users exist, an `admin` account is created using `INITIAL_ADMIN_PASSWORD`.

### Frontend

```bash
npm install
npm run dev
```

The Next.js dev server starts on `http://localhost:3000`. Open it in your browser to reach the login page.

## Configuration

Backend configuration is read from environment variables or a `.env` file in `backend/`.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:quartz-fabric.db` | SQLite database path |
| `LISTEN_ADDR` | `0.0.0.0:8080` | API listen address |
| `JWT_SECRET` | *(required)* | Secret used to sign session tokens |
| `JWT_EXPIRY_HOURS` | `8` | Session token lifetime in hours |
| `POLL_INTERVAL_SECS` | `300` | Seconds between automatic background device polls |
| `POLL_CONCURRENCY` | `5` | Max concurrent SSH connections during a poll cycle |
| `SSH_CONNECT_TIMEOUT_SECS` | `15` | SSH connection timeout per device |
| `SSH_READ_TIMEOUT_SECS` | `30` | Timeout waiting for SSH command output |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed frontend origin (CORS) |
| `INITIAL_ADMIN_PASSWORD` | `changeme` | Password for the seeded `admin` account |

Frontend configuration goes in `.env.local` at the project root:

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080/api` | Backend API base URL |

## Project Structure

```
quartz-fabric/
├── app/                       # Next.js App Router pages
│   ├── dashboard/
│   │   ├── devices/           # Device inventory and per-device detail tabs
│   │   ├── config-templates/  # Configuration template management
│   │   ├── users/             # User management (admin only)
│   │   ├── settings/          # System settings
│   │   └── profile/           # Current user profile
│   ├── login/                 # Login page
│   ├── globals.css            # Design system tokens and component styles
│   └── layout.tsx             # Root HTML layout
├── components/                # Shared React components
├── lib/                       # API client, auth context, toast system
├── backend/
│   ├── src/
│   │   ├── api/               # Axum route handlers
│   │   ├── main.rs            # Server entry point
│   │   ├── auth.rs            # JWT signing and Argon2 password hashing
│   │   ├── db.rs              # Database access layer
│   │   ├── models.rs          # Shared data types
│   │   ├── polling.rs         # Background SSH device polling task
│   │   ├── ssh.rs             # SSH communication via russh
│   │   └── config.rs          # Environment-based configuration
│   ├── migrations/            # SQLite schema migrations
│   └── Cargo.toml
└── package.json
```

## User Roles

| Role | Capabilities |
|---|---|
| `admin` | Full access — manage users, devices, settings, and templates; run commands |
| `operator` | Read and write — manage devices and templates; run commands |
| `viewer` | Read only — view device status and data; no writes or command execution |

## License

Copyright (C), 2026 Quartz Systems. Some rights reserved.  
Licensed under the MIT License — see [LICENSE.md](LICENSE.md) for details.
