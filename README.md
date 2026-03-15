# Reex API Builder

Reex API Builder is an intelligent API client built to bridge the gap between backend and frontend teams. It provides a robust, standardized environment for developers to test APIs and manage collections, while being meticulously designed to eliminate frontend integration boilerplate.

Import your API collection, and it instantly generates a clean, standardized, and fully typed REST API layer. Complete with React Query hooks, TypeScript types, and session-ready auth management, it is the fastest way to connect your frontend to any API.

---

## ✨ Features

* **Standardized Testing:** Test your endpoints (even on localhost) in a clean, intuitive UI.
* **Zero-Boilerplate Generation:** Instantly transform API collections into tested REST API code, React Query hooks, and TypeScript interfaces.
* **Intelligent Two-Way Sync:** Your code and the tool's UI are always aligned. Edit in your IDE or tweak in the tool—changes reflect perfectly on both sides.
* **Smart API Diffing:** Never get caught off guard by a backend update. Re-import a collection and instantly see exactly what endpoints, payloads, or types were added or removed before you integrate.
* **Drop-in Authentication:** Seamlessly manage user sessions with pre-built hooks for LocalStorage, Cookies, or Next-Auth for React and Next.js developers.

---

## 🚀 Getting Started (For Frontend Developers)

Reex API Builder relies on a global CLI package to bridge the connection between the Reex API Builder UI and your local project files.

### Step 1: Install the CLI Globally
Open your terminal and install the package globally via npm:

```bash
npm install -g reex-api-builder
```

### Step 2: Initialize Your Project
Navigate to the root directory of your React or Next.js project and run the build command:

```bash
reex-build
```

Once initialized, the CLI will sync your project with the Reex UI, allowing you to generate types, hooks, and REST clients instantly.

---

## 🔗 Links

- 🌐 [Reex API Builder App](https://reex-api-builder.toolshq.app/)
- 📖 [Full Documentation](https://reex-api-builder.toolshq.app/docs)

---

## 📄 License

MIT © Ezeka Emmanuel