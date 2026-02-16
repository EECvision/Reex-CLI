# Reex API Builder

Reex API Builder is a developer-first tool designed to streamline the lifecycle of API testing and integration. While traditional tools focus heavily on backend verification, Reex API Builder is built specifically with the Frontend Developer in mind.

It is not just an API client; it is a code generation engine. Reex API Builder connects directly to your local project, managing the gap between your API definitions and your UI components by generating strictly typed, production ready hooks directly into your codebase.

[![npm version](https://img.shields.io/npm/v/reex-api-builder.svg)](https://www.npmjs.com/package/reex-api-builder)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why Reex API Builder?

The standard workflow for frontend developers involves manually typing API collections, creating interfaces, and writing repetitive fetch hooks. **Reex API Builder eliminates this boilerplate:**

- ✨ **No more manual typing** – We generate your API collections for you
- 🔒 **No more interface mismatch** – TypeScript interfaces are generated automatically
- 🔄 **Seamless integration** – Code is injected directly into your project structure
- 📡 **Two-way sync** – Edit in the UI or your IDE, changes stay in sync

## Installation

```bash
npm install -g reex-api-builder
```

## Quick Start

```bash
# Navigate to your React project
cd my-react-app

# Launch Reex
reex-build
```

This starts the local bridge and opens the web UI, ready to generate code.

## Usage

### Basic Command

```bash
reex-build
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port <number>` | Port for the local server | `4000` |
| `-d, --dir <path>` | Target project directory | Current directory |
| `--no-open` | Don't auto-open browser | `false` |
| `-V, --version` | Show version number | |
| `-h, --help` | Show help | |

### Examples

```bash
# Custom port
reex-build -p 5000

# Specific directory
reex-build -d ./my-api-project
```

## How It Works

### 1. Import Your API Spec

Import your Swagger/OpenAPI or Postman collection via the web UI.

### 2. Generate Code

Click **Analyze** → **Update Selected**. Reex API Builder creates:

```
src/
└── api-services/
    ├── config/          # HTTP client & interceptors
    ├── definitions/     # API implementations (editable)
    ├── generated/       # React Query hooks (auto-generated)
    ├── types/           # TypeScript interfaces
    └── index.ts         # Barrel export
```

### 3. Wrap Your App

```tsx
import { QueryProvider } from './api-services/providers';

function App() {
  return (
    <QueryProvider>
      <YourApp />
    </QueryProvider>
  );
}
```

### 4. Use the Hooks

```tsx
import { useGetUsersQuery, useCreateUserMutation } from './api-services';

function UserList() {
  const { data, isLoading } = useGetUsersQuery();
  const createUser = useCreateUserMutation();
  
  // Full type safety, auto caching & invalidation
}
```

## Key Features

| Feature | Description |
|---------|-------------|
| **Auto Type Generation** | TypeScript interfaces from your API spec |
| **React Query Hooks** | Ready-to-use hooks with smart caching |
| **Two-Way Sync** | Edit in UI or IDE—changes stay synchronized |
| **Conflict Resolution** | Git-style diff view when APIs change |
| **Hot Reload** | File watcher regenerates on changes |

## Modes

| Mode | Use Case |
|------|----------|
| **Project Mode** | Full integration with your codebase (requires `reex-build` CLI) |
| **Standalone Mode** | Quick API testing without a project – [try it online](https://reex-api-builder.toolshq.app/) |
| **Text Mode** | Scratchpad for ad-hoc API testing |

## Requirements

- Node.js >= 16.0.0
- React project (for code generation)

## Links

- 📖 [Full Documentation](https://reex-api-builder.toolshq.app/docs)
- 🌐 [Web UI (Standalone Mode)](https://reex-api-builder.toolshq.app/)
- 🐛 [Report Issues](https://github.com/EECvision/reex-api-builder/issues)

## License

MIT © Ezeka Emmanuel
