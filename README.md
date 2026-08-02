# Reex API Builder (`reex-cli`)

[![npm version](https://img.shields.io/npm/v/reex-cli.svg?style=flat-square)](https://www.npmjs.com/package/reex-cli)
[![npm downloads](https://img.shields.io/npm/dm/reex-cli.svg?style=flat-square)](https://www.npmjs.com/package/reex-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![GitHub Repository](https://img.shields.io/badge/GitHub-EECvision%2FReex--api--bridge-blue?style=flat-square&logo=github)](https://github.com/EECvision/Reex-api-bridge)

Reex API Builder is an intelligent API client built to bridge the gap between backend and frontend teams. It provides a robust, standardized environment for developers to test APIs and manage collections, while being meticulously designed to eliminate frontend integration boilerplate. 

**✨ The magic happens in your browser. No installation required to start testing APIs.** Whether you are a backend developer testing endpoints or a frontend developer generating integration code, you can jump right in using the web app or install the npm package [`reex-cli`](https://www.npmjs.com/package/reex-cli).

---

## 🚀 Quick Start

### 1. The Web App (For Everyone)
You don't need to install anything to start testing APIs, managing collections, or collaborating. 

👉 **[Open Reex API Builder in your browser](https://reex-api-builder.toolshq.app/)**

### 2. Code Generation (For Frontend Developers)
If you are a frontend developer and want to instantly transform your API collections into tested REST API code, React Query hooks, and TypeScript interfaces, you can connect the web app to your local project using our CLI.

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

## 📖 Documentation

Want to dive deeper into advanced configurations and features? 
Check out our **[Full Documentation](https://reex-api-builder.toolshq.app/docs)**.