const express = require('express');
const fs = require('fs');
const path = require('path');

const createFsRouter = (apiTargetDir) => {
    const router = express.Router();

    // Save File
    router.post('/write', async (req, res) => {
        try {
            const { filePath, content } = req.body;
            const safePath = path.resolve(apiTargetDir, filePath);
            if (!safePath.startsWith(path.resolve(apiTargetDir))) {
                return res.status(403).json({ error: "Access Denied: Path traversal detected." });
            }

            fs.mkdirSync(path.dirname(safePath), { recursive: true });
            fs.writeFileSync(safePath, content, 'utf8');

            console.log(`[FS] Wrote file: ${filePath}`);
            res.json({ success: true });
        } catch (e) {
            console.error(`[FS] Write Error:`, e);
            res.status(500).json({ error: e.message });
        }
    });

    // Batch Operations (Writes and Deletes)
    router.post('/batch', async (req, res) => {
        try {
            const { operations } = req.body;
            if (!Array.isArray(operations)) {
                return res.status(400).json({ error: "Invalid operations array" });
            }

            for (const op of operations) {
                const safePath = path.resolve(apiTargetDir, op.filePath);
                if (!safePath.startsWith(path.resolve(apiTargetDir))) {
                    return res.status(403).json({ error: `Access Denied: Path traversal detected on ${op.filePath}` });
                }

                if (op.type === 'delete') {
                    if (fs.existsSync(safePath)) {
                        const stat = fs.statSync(safePath);
                        if (stat.isDirectory()) {
                            fs.rmSync(safePath, { recursive: true, force: true });
                        } else {
                            fs.unlinkSync(safePath);
                        }
                    }
                } else {
                    fs.mkdirSync(path.dirname(safePath), { recursive: true });
                    fs.writeFileSync(safePath, op.content || '', 'utf8');
                }
            }

            console.log(`[FS] Batch processed ${operations.length} operations`);
            res.json({ success: true, count: operations.length });
        } catch (e) {
            console.error(`[FS] Batch Error:`, e);
            res.status(500).json({ error: e.message });
        }
    });

    // Read File
    router.post('/read', async (req, res) => {
        try {
            const { filePath } = req.body;
            const safePath = path.resolve(apiTargetDir, filePath);
            if (!safePath.startsWith(path.resolve(apiTargetDir))) {
                return res.status(403).json({ error: "Access Denied: Path traversal detected." });
            }

            if (!fs.existsSync(safePath)) return res.status(404).json({ error: "File not found" });

            const content = fs.readFileSync(safePath, 'utf8');
            res.json({ success: true, content });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Delete File/Folder
    router.post('/delete', async (req, res) => {
        try {
            const { filePath } = req.body;
            const safePath = path.resolve(apiTargetDir, filePath);
            if (!safePath.startsWith(path.resolve(apiTargetDir))) {
                return res.status(403).json({ error: "Access Denied: Path traversal detected." });
            }

            if (fs.existsSync(safePath)) {
                const stat = fs.statSync(safePath);
                if (stat.isDirectory()) {
                    fs.rmSync(safePath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(safePath);
                }
            }
            console.log(`[FS] Deleted: ${filePath}`);
            res.json({ success: true });
        } catch (e) {
            console.error(`[FS] Delete Error:`, e);
            res.status(500).json({ error: e.message });
        }
    });

    // List Files
    router.post('/list', async (req, res) => {
        try {
            const { filePath } = req.body;
            const safePath = path.resolve(apiTargetDir, filePath);
            if (!safePath.startsWith(path.resolve(apiTargetDir))) {
                return res.status(403).json({ error: "Access Denied: Path traversal detected." });
            }

            if (!fs.existsSync(safePath)) return res.json({ success: true, files: [] });

            const files = fs.readdirSync(safePath);
            res.json({ success: true, files });
        } catch (e) {
            console.error(`[FS] List Error:`, e);
            res.status(500).json({ error: e.message });
        }
    });

    return router;
};

module.exports = createFsRouter;
