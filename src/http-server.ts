// src/http-server.ts - HTTP Transport for MCP Server
import cors from 'cors';
import express, { Request, Response } from 'express';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'PostScan Mail MCP Server' });
});

// MCP endpoint - simplified for demo purposes
app.post('/mcp', async (req: Request, res: Response) => {
  try {
    // For a full MCP-over-HTTP implementation, you would need to handle
    // the complete MCP protocol. For now, this is a simplified version.

    res.json({
      jsonrpc: '2.0',
      id: req.body.id || 1,
      result: {
        message: 'PostScan Mail MCP Server - HTTP endpoint available',
        note: 'Full MCP-over-HTTP protocol implementation needed for production use',
      },
    });
  } catch (error) {
    console.error('MCP request error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`PostScan Mail MCP HTTP Server running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`MCP endpoint: http://localhost:${port}/mcp`);
});

export { app };
