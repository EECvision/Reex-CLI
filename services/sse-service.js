class SseService {
    constructor() {
        this.clients = [];
    }

    /**
     * middleware to handle new SSE connections
     */
    handleConnection(req, res) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        // CORS headers for SSE
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.flushHeaders();

        console.log("[Bridge] New Client Connected");
        this.clients.push(res);
        req.on('close', () => {
            this.clients = this.clients.filter(c => c !== res);
        });
    }

    /**
     * Broadcast an event to all connected clients
     * @param {string} id 
     * @param {string} type 
     * @param {string} message 
     */
    broadcast(id, type, message) {
        this.clients.forEach(res => res.write(`data: ${JSON.stringify({ id, type, message })}\n\n`));
    }
}

module.exports = new SseService();
