// PostScan Mail MCP Server - Production Standalone Version
// For deployment to postscanmail.com/mcp/

import cors from 'cors';
import express from 'express';
import { UnifiedSearchEngine } from './index.js';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

// Initialize search engine
const searchEngine = new UnifiedSearchEngine();
let isInitialized = false;

async function ensureInitialized() {
  if (!isInitialized) {
    console.log('🔄 Initializing search engine...');
    await searchEngine['buildIndex']();
    isInitialized = true;
    console.log('✅ Search engine ready');
  }
}

// Middleware
app.use(
  cors({
    origin: ['https://www.postscanmail.com', 'https://postscanmail.com'],
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));

// Logging middleware
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'PostScan Mail MCP Server',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    initialized: isInitialized,
  });
});

// Search endpoint
app.post('/search', async (req, res) => {
  try {
    await ensureInitialized();

    const { query, category, maxResults, fuzzyMatch } = req.body;

    if (!query || query.length < 3) {
      return res.status(400).json({
        error: 'Query must be at least 3 characters long',
      });
    }

    const results = await searchEngine.search({
      query,
      category,
      maxResults: maxResults || 10,
      fuzzyMatch: fuzzyMatch !== false,
    });

    return res.json({
      query,
      category: category || 'all',
      results,
      totalResults: results.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get document content
app.get('/document/:filename', async (req, res) => {
  try {
    await ensureInitialized();

    const { filename } = req.params;
    const content = searchEngine.getDocument(filename);
    const metadata = searchEngine.getMetadata(filename);

    if (!content || !metadata) {
      return res.status(404).json({
        error: 'Document not found',
      });
    }

    return res.json({
      filename,
      content,
      metadata,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Document retrieval error:', error);
    return res.status(500).json({
      error: 'Failed to retrieve document',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// List all documents
app.get('/documents', async (_req, res) => {
  try {
    await ensureInitialized();

    const documents = [];
    for (const [filename, metadata] of searchEngine['documentsIndex']) {
      documents.push({
        filename,
        title: metadata.title,
        category: metadata.category,
        tags: metadata.tags,
        summary: metadata.summary,
        wordCount: metadata.wordCount,
        url: metadata.url,
      });
    }

    res.json({
      documents,
      totalDocuments: documents.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Documents listing error:', error);
    res.status(500).json({
      error: 'Failed to list documents',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// MCP compatibility endpoint
app.post('/mcp', async (req, res) => {
  try {
    const { method, params } = req.body;

    if (method === 'tools/list') {
      return res.json({
        jsonrpc: '2.0',
        id: req.body.id,
        result: {
          tools: [
            {
              name: 'search_documents',
              description: 'Search PostScan Mail documentation',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Search query' },
                  category: {
                    type: 'string',
                    description: 'Document category filter',
                  },
                  maxResults: {
                    type: 'number',
                    description: 'Maximum number of results',
                  },
                },
                required: ['query'],
              },
            },
            {
              name: 'get_document',
              description: 'Get full document content',
              inputSchema: {
                type: 'object',
                properties: {
                  filename: {
                    type: 'string',
                    description: 'Document filename',
                  },
                },
                required: ['filename'],
              },
            },
          ],
        },
      });
    }

    if (method === 'tools/call') {
      await ensureInitialized();

      if (params?.name === 'search_documents') {
        const results = await searchEngine.search(params.arguments);

        let response = `**🔍 Search Results for "${params.arguments.query}"**\n\n`;
        response += `Found ${results.length} relevant document${results.length > 1 ? 's' : ''}:\n\n`;

        results.forEach((result, index) => {
          response += `**${index + 1}. ${result.title}**\n`;
          response += `Category: ${result.category} | Score: ${result.relevanceScore}\n`;
          response += `${result.snippet}\n`;
          response += `🔗 [View Document](${result.url})\n\n`;
        });

        if (results.length === 0) {
          response = `No documents found for "${params.arguments.query}". Try different search terms or contact support.`;
        }

        return res.json({
          jsonrpc: '2.0',
          id: req.body.id,
          result: {
            content: [
              {
                type: 'text',
                text: response,
              },
            ],
          },
        });
      }

      if (params?.name === 'get_document') {
        const content = searchEngine.getDocument(params.arguments.filename);
        const metadata = searchEngine.getMetadata(params.arguments.filename);

        if (!content || !metadata) {
          return res.json({
            jsonrpc: '2.0',
            id: req.body.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Document "${params.arguments.filename}" not found.`,
                },
              ],
            },
          });
        }

        return res.json({
          jsonrpc: '2.0',
          id: req.body.id,
          result: {
            content: [
              {
                type: 'text',
                text: `# ${metadata.title}\n\n${content}`,
              },
            ],
          },
        });
      }
    }

    // Default MCP response
    return res.json({
      jsonrpc: '2.0',
      id: req.body.id,
      result: {
        message: 'PostScan Mail MCP Server',
        version: '3.0.0',
        endpoints: {
          search: 'POST /search',
          documents: 'GET /documents',
          document: 'GET /document/:filename',
          health: 'GET /health',
        },
      },
    });
  } catch (error) {
    console.error('MCP error:', error);
    return res.status(500).json({
      jsonrpc: '2.0',
      id: req.body.id,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

// Root endpoint with API documentation
app.get('/', (_req, res) => {
  res.json({
    name: 'PostScan Mail MCP Server',
    version: '3.0.0',
    description:
      'HTTP-based document search server for PostScan Mail documentation',
    endpoints: {
      health: 'GET /health - Server health check',
      search: 'POST /search - Search documents',
      documents: 'GET /documents - List all documents',
      document: 'GET /document/:filename - Get specific document',
      mcp: 'POST /mcp - MCP protocol endpoint',
    },
    usage: {
      search: {
        method: 'POST',
        url: '/search',
        body: {
          query: 'string (required)',
          category: 'string (optional)',
          maxResults: 'number (optional)',
          fuzzyMatch: 'boolean (optional)',
        },
      },
    },
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use(
  (
    error: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    availableEndpoints: [
      '/',
      '/health',
      '/search',
      '/documents',
      '/document/:filename',
      '/mcp',
    ],
    timestamp: new Date().toISOString(),
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 PostScan Mail MCP Server running on port ${port}`);
  console.log(`📋 Health check: http://localhost:${port}/health`);
  console.log(`🔍 Search API: POST http://localhost:${port}/search`);
  console.log(`📚 Documents: GET http://localhost:${port}/documents`);
  console.log(`🔗 MCP endpoint: POST http://localhost:${port}/mcp`);
  console.log(`📖 API docs: GET http://localhost:${port}/`);
  console.log(`🌍 Server ready for production deployment`);

  // Initialize search engine in background
  ensureInitialized().catch(error => {
    console.error('❌ Search engine initialization failed:', error);
  });
});

export default app;
