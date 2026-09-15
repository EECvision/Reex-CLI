# Reex API CLI (`reex-cli`)

[![npm version](https://img.shields.io/npm/v/reex-cli.svg?style=flat-square)](https://www.npmjs.com/package/reex-cli)
[![npm downloads](https://img.shields.io/npm/dm/reex-cli.svg?style=flat-square)](https://www.npmjs.com/package/reex-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![GitHub Repository](https://img.shields.io/badge/GitHub-EECvision%2FReex--api--bridge-blue?style=flat-square&logo=github)](https://github.com/EECvision/Reex-api-bridge)

**Reex is the React framework for API integration.** `reex-cli` connects your local codebase to Reex API Studio to generate and sync production-ready typed API services, TanStack Query hooks, and auth providers directly inside your React and Next.js applications.

* **🌐 [Official Website](https://www.reex-api.dev)** — The React Framework for API Integration
* **⚡ [Reex API Studio](https://studio.reex-api.dev/)** — Web application for testing APIs and managing collections
* **📖 [Documentation](https://docs.reex-api.dev/)** — Complete guides, CLI usage, and tutorials

**✨ The magic happens in your browser and your local terminal.** Whether you are testing endpoints or generating type-safe React Query integration code, you can jump right in using [Reex API Studio](https://studio.reex-api.dev/) or install the npm package [`reex-cli`](https://www.npmjs.com/package/reex-cli).

---

## 🚀 Quick Start

### 1. The Web App (Reex API Studio)
You don't need to install anything to start testing APIs, managing collections, or collaborating. 

👉 **[Open Reex API Studio in your browser](https://studio.reex-api.dev/)**

### 2. Code Generation (For Frontend Developers)
If you are a frontend developer and want to instantly transform your API collections into tested REST API code, React Query hooks, and TypeScript interfaces, you can connect the web app to your local project using the Reex CLI.

**Step A: Install the CLI Globally**
```bash
npm install -g reex-cli
```

**Step B: Initialize Your Project**
Navigate to the root directory of your React or Next.js project and run:
```bash
reex start
```
*Once initialized, the CLI will sync your local project files with the Reex UI, allowing you to seamlessly push generated code straight into your codebase.*

**Step C: Resetting (Optional)**
If you ever want to reset your generated files back to their default templates, simply run:
```bash
reex reset
```

---

## ✨ Core Features

* **Standardized Testing:** Test your endpoints (even on localhost) in a clean, intuitive UI right from your browser.
* **Zero-Boilerplate Generation:** Instantly transform API collections into tested REST API code, React Query hooks, and TypeScript interfaces.
* **Intelligent Two-Way Sync:** Your code and the tool's UI are always aligned. Edit in your IDE or tweak in the tool—changes reflect perfectly on both sides.
* **Smart API Diffing:** Never get caught off guard by a backend update. Re-import a collection and instantly see exactly what endpoints, payloads, or types were added or removed before you integrate.
* **Drop-in Authentication:** Seamlessly manage user sessions with pre-built hooks for JWT, Cookies, or Next-Auth for React and Next.js developers.

---

## 📖 Documentation & Links

* 📚 **[Full Documentation](https://docs.reex-api.dev)**: Advanced configurations, dev mode, and architecture
* 🌐 **[Reex API Marketing Site](https://www.reex-api.dev)**: Overview and features
* ⚡ **[Reex API Studio](https://studio.reex-api.dev)**: Test endpoints and generate hooks online