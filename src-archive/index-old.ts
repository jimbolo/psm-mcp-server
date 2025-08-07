// src/index.ts - Complete robust MCP server with integrated advanced search and config validation
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// === UTILITY FUNCTION FOR ERROR HANDLING ===
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// === MCP CONFIGURATION INTERFACES ===
interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}

interface MCPConfig {
  mcpServers?: Record<string, MCPServerConfig>;
  servers?: Record<string, MCPServerConfig>; // Alternative key name
  enabled?: boolean;
}

interface ServerValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  configPath?: string | null;
  serverCount?: number;
}

// === MCP CONFIGURATION VALIDATOR ===
class MCPConfigValidator {
  private static readonly CONFIG_PATHS = [
    path.join(
      os.homedir(),
      'Library/Application Support/Claude/claude_desktop_config.json'
    ),
    path.join(os.homedir(), '.config/claude/claude_desktop_config.json'),
    path.join(
      os.homedir(),
      'AppData/Roaming/Claude/claude_desktop_config.json'
    ),
  ];

  private static readonly REQUIRED_SERVER_NAME = 'PostScan Mail'; // Your server identifier

  static async validateConfiguration(): Promise<ServerValidationResult> {
    const result: ServerValidationResult = {
      isValid: false,
      errors: [],
      warnings: [],
    };

    try {
      // Try to find and load configuration
      const configData = await this.loadConfiguration();
      if (!configData.config) {
        result.errors.push(
          `Configuration file not found in any of the expected locations`
        );
        result.errors.push(`Expected paths: ${this.CONFIG_PATHS.join(', ')}`);
        return result;
      }

      result.configPath = configData.path;
      const config = configData.config;

      // Check if MCP is enabled (if the field exists)
      if (config.enabled === false) {
        result.errors.push('MCP is explicitly disabled in configuration');
        return result;
      }

      // Get servers from either mcpServers or servers key
      const servers = config.mcpServers || config.servers || {};
      result.serverCount = Object.keys(servers).length;

      if (Object.keys(servers).length === 0) {
        result.errors.push('No MCP servers configured');
        result.errors.push(
          'Add server configurations to claude_desktop_config.json'
        );
        return result;
      }

      // Validate server configurations
      const serverValidation = await this.validateServers(servers);
      result.errors.push(...serverValidation.errors);
      result.warnings.push(...serverValidation.warnings);

      // Check if THIS server is configured
      if (!servers[this.REQUIRED_SERVER_NAME]) {
        result.warnings.push(
          `This server (${this.REQUIRED_SERVER_NAME}) is not configured in Claude Desktop`
        );
        result.warnings.push(
          'Consider adding it to your claude_desktop_config.json for full functionality'
        );
      }

      result.isValid = result.errors.length === 0;
      return result;
    } catch (error) {
      result.errors.push(
        `Configuration validation failed: ${getErrorMessage(error)}`
      );
      return result;
    }
  }

  private static async loadConfiguration(): Promise<{
    config: MCPConfig | null;
    path: string | null;
  }> {
    for (const configPath of this.CONFIG_PATHS) {
      try {
        const configData = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configData) as MCPConfig;
        return { config, path: configPath };
      } catch (error) {
        // Continue to next path
        continue;
      }
    }
    return { config: null, path: null };
  }

  private static async validateServers(
    servers: Record<string, MCPServerConfig>
  ): Promise<{
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const [serverName, serverConfig] of Object.entries(servers)) {
      // Skip disabled servers
      if (serverConfig.disabled) {
        warnings.push(`Server '${serverName}' is disabled`);
        continue;
      }

      // Check required fields
      if (!serverConfig.command) {
        errors.push(`Server '${serverName}' missing required 'command' field`);
        continue;
      }

      // Basic command validation (without executing)
      try {
        // Check if command looks like a valid path or executable
        if (
          !serverConfig.command.includes('/') &&
          !serverConfig.command.includes('\\')
        ) {
          // Looks like a global command, which is fine
          warnings.push(
            `Server '${serverName}' uses global command '${serverConfig.command}' - ensure it's in PATH`
          );
        }
      } catch (error) {
        warnings.push(
          `Server '${serverName}' command validation warning: ${getErrorMessage(error)}`
        );
      }
    }

    return { errors, warnings };
  }

  static generateConfigExample(): string {
    return `
Example claude_desktop_config.json configuration:

{
  "mcpServers": {
    "${this.REQUIRED_SERVER_NAME}": {
      "command": "node",
      "args": ["path/to/your/dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}

Save this in one of these locations:
${this.CONFIG_PATHS.map(p => `- ${p}`).join('\n')}
`;
  }
}

// === DOCUMENT CONFIGURATION ===
interface DocumentConfig {
  filename: string;
  category: string;
  priority: number; // 1 = highest priority
  tags: string[];
  description?: string;
  aliases?: string[]; // Alternative names/terms
}

// Organized document catalog with metadata
const DOCUMENT_CATALOG: DocumentConfig[] = [
  // Core Services (High Priority)
  {
    filename: 'virtual_mailroom.md',
    category: 'services',
    priority: 1,
    tags: ['mail', 'virtual', 'mailroom', 'mailroom-app', 'mailroom-software'],
    description: 'PostScan Mail mailroom service and mailroom application',
    aliases: ['mailroom service', 'mailroom application', 'mailroom software'],
  },
  // {
  //   filename: 'mail_forwarding_service.md',
  //   category: 'services',
  //   priority: 1,
  //   tags: ['mail', 'forwarding', 'shipping', 'delivery'],
  //   description: 'Mail forwarding and shipping options',
  //   aliases: ['forward mail', 'mail delivery', 'shipping'],
  // },
  // {
  //   filename: 'package_management.md',
  //   category: 'services',
  //   priority: 1,
  //   tags: ['packages', 'management', 'storage', 'handling'],
  //   description: 'Package receiving and management services',
  //   aliases: ['package handling', 'parcel management'],
  // },
  // // Getting Started (Medium Priority)
  // {
  //   filename: 'getting_started_guide.md',
  //   category: 'onboarding',
  //   priority: 2,
  //   tags: ['setup', 'start', 'guide', 'new-user', 'tutorial'],
  //   description: 'Complete getting started guide for new users',
  //   aliases: ['how to start', 'begin', 'first steps'],
  // },
  // {
  //   filename: 'account_setup.md',
  //   category: 'onboarding',
  //   priority: 2,
  //   tags: ['account', 'setup', 'registration', 'profile'],
  //   description: 'Account creation and initial setup',
  //   aliases: ['create account', 'sign up', 'register'],
  // },
  // // Support & FAQ (Medium Priority)
  // {
  //   filename: 'general_faq.md',
  //   category: 'support',
  //   priority: 3,
  //   tags: ['faq', 'questions', 'general', 'help', 'common'],
  //   description: 'Frequently asked questions',
  //   aliases: ['questions', 'help', 'q&a'],
  // },
  // {
  //   filename: 'billing_faq.md',
  //   category: 'support',
  //   priority: 3,
  //   tags: ['billing', 'payment', 'pricing', 'costs', 'fees'],
  //   description: 'Billing and payment related questions',
  //   aliases: ['payment', 'cost', 'price', 'money'],
  // },
  // {
  //   filename: 'troubleshooting.md',
  //   category: 'support',
  //   priority: 3,
  //   tags: ['troubleshoot', 'problems', 'issues', 'fix', 'solve'],
  //   description: 'Common problems and solutions',
  //   aliases: ['fix', 'problem', 'issue', 'broken'],
  // },
];

// === SEARCH INTERFACES ===
interface SearchOptions {
  query: string;
  category?: string;
  tags?: string[];
  maxResults?: number;
  includeContent?: boolean;
  fuzzyMatch?: boolean;
  sortBy?: 'relevance' | 'priority' | 'alphabetical';
}

interface SearchResult {
  filename: string;
  title: string;
  category: string;
  snippet: string;
  relevance: number;
  tags: string[];
  priority: number;
  description: string;
  matchTypes: string[]; // What matched: title, content, tags, etc.
}

interface SearchIndex {
  [filename: string]: {
    title: string;
    category: string;
    tags: string[];
    keywords: string[];
    summary: string;
    wordCount: number;
  };
}

interface QuickAnswer {
  title: string;
  answer: string;
  relatedDocs: string[];
}

// === INTEGRATED SEARCH ENGINE ===
class AdvancedSearchEngine {
  private searchIndex: SearchIndex = {};
  private contentCache = new Map<string, string>();
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  // === INDEX BUILDING ===
  async buildSearchIndex(): Promise<void> {
    // Building advanced search index (silent for MCP compatibility)

    for (const docConfig of DOCUMENT_CATALOG) {
      try {
        const content = await this.getContent(docConfig.filename);
        const title =
          this.extractTitle(content) || this.getDisplayName(docConfig.filename);

        // Extract keywords and create summary
        const keywords = this.extractKeywords(content, docConfig);
        const summary = this.createSummary(content);

        this.searchIndex[docConfig.filename] = {
          title,
          category: docConfig.category,
          tags: docConfig.tags,
          keywords,
          summary,
          wordCount: content.split(/\s+/).length,
        };

        // Indexed: ${docConfig.filename} (${keywords.length} keywords) - silent for MCP
      } catch (error) {
        // Failed to index ${docConfig.filename}: ${error} - silent for MCP
      }
    }

    // Search index complete: ${Object.keys(this.searchIndex).length} documents - silent for MCP
  }

  // === SMART SEARCH ===
  async smartSearch(options: SearchOptions): Promise<SearchResult[]> {
    if (Object.keys(this.searchIndex).length === 0) {
      await this.buildSearchIndex();
    }

    const {
      query,
      category,
      maxResults = 5,
      fuzzyMatch = true,
      sortBy = 'relevance',
    } = options;

    // Smart search: "${query}" (category: ${category || 'all'}) - silent for MCP

    const searchTerms = this.preprocessQuery(query);
    const results: SearchResult[] = [];

    // Filter documents by category if specified
    const documentsToSearch = category
      ? DOCUMENT_CATALOG.filter(doc => doc.category === category)
      : DOCUMENT_CATALOG;

    for (const docConfig of documentsToSearch) {
      try {
        const relevance = await this.calculateRelevance(
          docConfig,
          searchTerms,
          fuzzyMatch
        );

        if (relevance.score > 0) {
          const content = await this.getContent(docConfig.filename);
          const indexData = this.searchIndex[docConfig.filename];

          results.push({
            filename: docConfig.filename,
            title: indexData.title,
            category: docConfig.category,
            snippet: await this.generateSnippet(content, searchTerms),
            relevance: relevance.score,
            tags: docConfig.tags,
            priority: docConfig.priority,
            description: docConfig.description || '',
            matchTypes: relevance.matchTypes,
          });
        }
      } catch (error) {
        // Error searching ${docConfig.filename}: ${error} - silent for MCP
      }
    }

    // Sort results
    this.sortResults(results, sortBy);

    return results.slice(0, maxResults);
  }

  // === RELEVANCE CALCULATION ===
  private async calculateRelevance(
    docConfig: DocumentConfig,
    searchTerms: string[],
    fuzzyMatch: boolean
  ): Promise<{ score: number; matchTypes: string[] }> {
    let score = 0;
    const matchTypes: string[] = [];
    const indexData = this.searchIndex[docConfig.filename];

    if (!indexData) return { score: 0, matchTypes: [] };

    // 1. Exact title matches (highest weight: 50 points)
    for (const term of searchTerms) {
      if (indexData.title.toLowerCase().includes(term)) {
        score += 50;
        matchTypes.push('title');
        break;
      }
    }

    // 2. Alias matches (high weight: 40 points)
    if (docConfig.aliases) {
      for (const alias of docConfig.aliases) {
        for (const term of searchTerms) {
          if (alias.toLowerCase().includes(term)) {
            score += 40;
            matchTypes.push('alias');
            break;
          }
        }
      }
    }

    // 3. Category matches (medium-high weight: 30 points)
    for (const term of searchTerms) {
      if (docConfig.category.toLowerCase().includes(term)) {
        score += 30;
        matchTypes.push('category');
        break;
      }
    }

    // 4. Tag matches (medium weight: 20 points each)
    for (const tag of docConfig.tags) {
      for (const term of searchTerms) {
        if (
          tag.toLowerCase().includes(term) ||
          (fuzzyMatch && this.fuzzyMatch(tag.toLowerCase(), term))
        ) {
          score += 20;
          matchTypes.push('tag');
        }
      }
    }

    // 5. Keyword matches (medium weight: 15 points each)
    for (const keyword of indexData.keywords) {
      for (const term of searchTerms) {
        if (
          keyword.includes(term) ||
          (fuzzyMatch && this.fuzzyMatch(keyword, term))
        ) {
          score += 15;
          matchTypes.push('keyword');
        }
      }
    }

    // 6. Description matches (low-medium weight: 10 points)
    if (docConfig.description) {
      for (const term of searchTerms) {
        if (docConfig.description.toLowerCase().includes(term)) {
          score += 10;
          matchTypes.push('description');
        }
      }
    }

    // 7. Content matches (low weight: 5 points each, max 25)
    const content = await this.getContent(docConfig.filename);
    let contentMatches = 0;
    for (const term of searchTerms) {
      const matches = (content.toLowerCase().match(new RegExp(term, 'g')) || [])
        .length;
      contentMatches += Math.min(matches, 5); // Cap at 5 matches per term
    }
    score += Math.min(contentMatches * 5, 25);
    if (contentMatches > 0) {
      matchTypes.push('content');
    }

    // 8. Priority boost (higher priority = lower number = more points)
    score += (6 - docConfig.priority) * 5;

    // 9. Penalty for very long documents (reduces noise)
    if (indexData.wordCount > 2000) {
      score *= 0.9;
    }

    return {
      score: Math.round(score),
      matchTypes: [...new Set(matchTypes)],
    };
  }

  // === QUERY PROCESSING ===
  private preprocessQuery(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter(term => term.length > 2) // Remove very short terms
      .filter(term => !this.isStopWord(term)); // Remove stop words
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the',
      'be',
      'to',
      'of',
      'and',
      'a',
      'in',
      'that',
      'have',
      'i',
      'it',
      'for',
      'not',
      'on',
      'with',
      'he',
      'as',
      'you',
      'do',
      'at',
      'this',
      'but',
      'his',
      'by',
      'from',
      'they',
      'we',
      'say',
      'her',
      'she',
      'or',
      'an',
      'will',
      'my',
      'one',
      'all',
      'would',
      'there',
      'their',
      'what',
      'so',
      'up',
      'out',
      'if',
      'about',
      'who',
      'get',
      'which',
      'go',
      'me',
      'can',
      'how',
      'when',
      'where',
      'why',
    ]);
    return stopWords.has(word);
  }

  // === FUZZY MATCHING ===
  private fuzzyMatch(text: string, term: string): boolean {
    if (text.length < term.length) return false;
    const threshold = Math.floor(term.length * 0.2);
    return this.levenshteinDistance(text, term) <= threshold;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  // === CONTENT PROCESSING ===
  private extractKeywords(
    content: string,
    docConfig: DocumentConfig
  ): string[] {
    const cleanContent = content
      .replace(/[#*`_\[\]()]/g, ' ')
      .replace(/\bhttps?:\/\/\S+/g, ' ')
      .toLowerCase();

    const words = cleanContent.match(/\b[a-z]{3,}\b/g) || [];
    const wordFreq: { [key: string]: number } = {};

    words.forEach(word => {
      if (!this.isStopWord(word)) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });

    // Add config-based terms with higher weight
    docConfig.tags.forEach(tag => {
      wordFreq[tag.toLowerCase()] = (wordFreq[tag.toLowerCase()] || 0) + 5;
    });

    if (docConfig.aliases) {
      docConfig.aliases.forEach(alias => {
        const aliasWords = alias.toLowerCase().split(/\s+/);
        aliasWords.forEach(word => {
          if (word.length > 2) {
            wordFreq[word] = (wordFreq[word] || 0) + 3;
          }
        });
      });
    }

    return Object.entries(wordFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 30)
      .map(([word]) => word);
  }

  private createSummary(content: string): string {
    const paragraphs = content
      .replace(/^#{1,6}\s+.*$/gm, '')
      .replace(/^\s*[-*+]\s+.*$/gm, '')
      .split('\n\n')
      .map(p => p.trim())
      .filter(p => p.length > 100);

    return (
      paragraphs[0]?.substring(0, 300) +
        (paragraphs[0]?.length > 300 ? '...' : '') ||
      content.substring(0, 200) + '...'
    );
  }

  private async generateSnippet(
    content: string,
    searchTerms: string[]
  ): Promise<string> {
    const sentences = content.split(/[.!?]+/);
    let bestSnippet = '';
    let maxMatches = 0;

    for (let i = 0; i < sentences.length; i++) {
      const snippet = sentences
        .slice(i, i + 3)
        .join('. ')
        .trim();
      if (snippet.length < 50) continue;

      const matches = searchTerms.reduce((count, term) => {
        return count + (snippet.toLowerCase().split(term).length - 1);
      }, 0);

      if (matches > maxMatches) {
        maxMatches = matches;
        bestSnippet = snippet;
      }
    }

    if (!bestSnippet || maxMatches === 0) {
      return content.substring(0, 300) + '...';
    }

    let highlightedSnippet = bestSnippet;
    searchTerms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi');
      highlightedSnippet = highlightedSnippet.replace(regex, '**$1**');
    });

    return (
      highlightedSnippet.substring(0, 400) +
      (highlightedSnippet.length > 400 ? '...' : '')
    );
  }

  // === SORTING ===
  private sortResults(results: SearchResult[], sortBy: string) {
    switch (sortBy) {
      case 'priority':
        results.sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return b.relevance - a.relevance;
        });
        break;
      case 'alphabetical':
        results.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'relevance':
      default:
        results.sort((a, b) => {
          if (b.relevance !== a.relevance) return b.relevance - a.relevance;
          return a.priority - b.priority;
        });
        break;
    }
  }

  // === SPECIALIZED SEARCH METHODS ===
  async searchByCategory(
    category: string,
    query?: string
  ): Promise<SearchResult[]> {
    const options: SearchOptions = {
      query: query || '',
      category,
      maxResults: 10,
    };
    return this.smartSearch(options);
  }

  async searchByTags(tags: string[]): Promise<SearchResult[]> {
    const matchingDocs = DOCUMENT_CATALOG.filter(doc =>
      tags.some(tag => doc.tags.includes(tag))
    );

    const results: SearchResult[] = [];
    for (const docConfig of matchingDocs) {
      try {
        await this.getContent(docConfig.filename); // Load content for cache
        const indexData = this.searchIndex[docConfig.filename];

        if (indexData) {
          results.push({
            filename: docConfig.filename,
            title: indexData.title,
            category: docConfig.category,
            snippet: indexData.summary,
            relevance: 10 + (5 - docConfig.priority) * 2,
            tags: docConfig.tags,
            priority: docConfig.priority,
            description: docConfig.description || '',
            matchTypes: ['tag'],
          });
        }
      } catch (error) {
        // Error loading ${docConfig.filename}: ${error} - silent for MCP
      }
    }

    this.sortResults(results, 'priority');
    return results;
  }

  async findSimilarDocuments(filename: string): Promise<SearchResult[]> {
    const docConfig = DOCUMENT_CATALOG.find(d => d.filename === filename);
    if (!docConfig) return [];

    const similarityQuery = docConfig.tags.slice(0, 3).join(' ');
    const options: SearchOptions = {
      query: similarityQuery,
      category: docConfig.category,
      maxResults: 5,
    };

    const results = await this.smartSearch(options);
    return results.filter(r => r.filename !== filename);
  }

  // === UTILITY METHODS ===
  private async getContent(filename: string): Promise<string> {
    if (this.contentCache.has(filename)) {
      return this.contentCache.get(filename)!;
    }

    const response = await fetch(`${this.baseUrl}${filename}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();
    this.contentCache.set(filename, content);
    return content;
  }

  private extractTitle(content: string): string | null {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }

  private getDisplayName(filename: string): string {
    return filename
      .replace('.md', '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  getSearchStats() {
    return {
      indexedDocuments: Object.keys(this.searchIndex).length,
      categories: [...new Set(DOCUMENT_CATALOG.map(d => d.category))],
      totalTags: [...new Set(DOCUMENT_CATALOG.flatMap(d => d.tags))].length,
      avgKeywordsPerDoc:
        Object.values(this.searchIndex).reduce(
          (sum, doc) => sum + doc.keywords.length,
          0
        ) / Object.keys(this.searchIndex).length || 0,
    };
  }
}

// === CONFIGURATION ===
const COMPANY_NAME = 'PostScan Mail';
const BASE_URL = 'https://www.postscanmail.com/tools/markdown/';

// === ENHANCED MCP SERVER ===
class EnhancedMCPServer {
  private server: Server;
  private searchEngine: AdvancedSearchEngine;
  private contentCache = new Map<string, any>();
  private configValidation: ServerValidationResult | null = null;
  private isReady: boolean = false;

  constructor() {
    this.server = new Server(
      {
        name: `${COMPANY_NAME.toLowerCase().replace(/\s+/g, '-')}-enhanced-mcp`,
        version: '2.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.searchEngine = new AdvancedSearchEngine(BASE_URL);
    this.log(
      'Enhanced MCP Server initialized with advanced search and config validation'
    );
  }

  // === INITIALIZATION WITH VALIDATION ===
  async initialize(): Promise<void> {
    this.log('Starting MCP configuration validation...');

    try {
      // Step 1: Validate MCP configuration
      this.configValidation = await MCPConfigValidator.validateConfiguration();

      if (!this.configValidation.isValid) {
        this.log('MCP Configuration validation failed:', 'error');
        this.configValidation.errors.forEach(error => {
          this.log(`  - ${error}`, 'error');
        });

        this.log('\nConfiguration Help:', 'error');
        this.log(MCPConfigValidator.generateConfigExample(), 'error');

        throw new Error('MCP configuration validation failed');
      }

      // Log validation results
      this.log('MCP Configuration validation passed');
      if (this.configValidation.configPath) {
        this.log(`Config file: ${this.configValidation.configPath}`);
      }
      if (this.configValidation.serverCount) {
        this.log(`Configured servers: ${this.configValidation.serverCount}`);
      }

      // Log warnings if any
      if (this.configValidation.warnings.length > 0) {
        this.log('Configuration warnings:');
        this.configValidation.warnings.forEach(warning => {
          this.log(`  - ${warning}`);
        });
      }

      // Step 2: Setup handlers
      this.setupHandlers();

      // Step 3: Build search index
      this.log('Building search index...');
      await this.searchEngine.buildSearchIndex();

      this.isReady = true;
      this.log('Server initialization complete');
    } catch (error) {
      this.log(
        `Server initialization failed: ${getErrorMessage(error)}`,
        'error'
      );
      throw error;
    }
  }

  // === READINESS CHECK ===
  private ensureReady(): void {
    if (!this.isReady) {
      throw new McpError(
        ErrorCode.InternalError,
        'Server not ready - initialization may have failed'
      );
    }
  }

  private setupHandlers() {
    // === RESOURCES ===
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      this.ensureReady();
      this.log('Listing enhanced resources');

      return {
        resources: DOCUMENT_CATALOG.map(doc => ({
          uri: `company://${doc.filename}`,
          mimeType: 'text/markdown',
          name: this.getDisplayName(doc.filename),
          description: doc.description || `${doc.category} documentation`,
          annotations: {
            category: doc.category,
            priority: doc.priority.toString(),
            tags: doc.tags.join(', '),
          },
        })),
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async request => {
      this.ensureReady();
      const filename = request.params.uri.replace('company://', '');
      this.log(`Reading resource: ${filename}`);

      const docExists = DOCUMENT_CATALOG.some(doc => doc.filename === filename);
      if (!docExists) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Unknown resource: ${filename}`
        );
      }

      try {
        const content = await this.getContent(filename);
        const docConfig = DOCUMENT_CATALOG.find(d => d.filename === filename);

        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: 'text/markdown',
              text: content,
              annotations: docConfig
                ? {
                    category: docConfig.category,
                    tags: docConfig.tags.join(', '),
                    description: docConfig.description || '',
                  }
                : undefined,
            },
          ],
        };
      } catch (error) {
        this.log(`Error reading ${filename}: ${error}`, 'error');
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch ${filename}: ${error}`
        );
      }
    });

    // === ENHANCED TOOLS ===
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.ensureReady();
      this.log('Listing enhanced tools');

      return {
        tools: [
          {
            name: 'smart_search',
            description:
              'Advanced semantic search with relevance ranking and category filtering',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Your search query (natural language supported)',
                },
                category: {
                  type: 'string',
                  description: 'Filter by category',
                  enum: [
                    'services',
                    'pricing',
                    'locations',
                    'onboarding',
                    'support',
                    'all',
                  ],
                },
                maxResults: {
                  type: 'number',
                  description: 'Maximum results (1-20)',
                  default: 5,
                  minimum: 1,
                  maximum: 20,
                },
                sortBy: {
                  type: 'string',
                  description: 'Sort results by',
                  enum: ['relevance', 'priority', 'alphabetical'],
                  default: 'relevance',
                },
                fuzzyMatch: {
                  type: 'boolean',
                  description: 'Enable fuzzy matching for typos',
                  default: true,
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'browse_category',
            description: 'Browse all documents in a specific category',
            inputSchema: {
              type: 'object',
              properties: {
                category: {
                  type: 'string',
                  description: 'Category to browse',
                  enum: [
                    'services',
                    'pricing',
                    'locations',
                    'onboarding',
                    'support',
                  ],
                },
                query: {
                  type: 'string',
                  description: 'Optional: search within category',
                },
              },
              required: ['category'],
            },
          },
          {
            name: 'find_by_tags',
            description: 'Find documents by specific tags',
            inputSchema: {
              type: 'object',
              properties: {
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Tags to search for (e.g., ["mail", "setup"])',
                },
              },
              required: ['tags'],
            },
          },
          {
            name: 'get_similar',
            description: 'Find documents similar to a specific document',
            inputSchema: {
              type: 'object',
              properties: {
                filename: {
                  type: 'string',
                  description: 'Filename to find similar documents for',
                },
              },
              required: ['filename'],
            },
          },
          {
            name: 'search_help',
            description:
              'Get help with search features and available categories/tags',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'quick_answers',
            description: 'Get quick answers to common questions',
            inputSchema: {
              type: 'object',
              properties: {
                question_type: {
                  type: 'string',
                  description: 'Type of question',
                  enum: [
                    'how_to_start',
                    'how_create',
                    'pricing',
                    'support',
                    'phone',
                    'email',
                    'contact_support',
                    'support_contact',
                    'account_issues',
                  ],
                },
              },
              required: ['question_type'],
            },
          },
          {
            name: 'server_status',
            description: 'Get server status and configuration information',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    // === TOOL EXECUTION ===
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      this.ensureReady();
      const { name, arguments: args } = request.params;
      this.log(`Executing enhanced tool: ${name}`);

      if (!args) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `No arguments provided for tool: ${name}`
        );
      }

      try {
        switch (name) {
          case 'smart_search':
            return await this.handleSmartSearch(args as any);
          case 'browse_category':
            return await this.handleBrowseCategory(args as any);
          case 'find_by_tags':
            return await this.handleFindByTags(args as any);
          case 'get_similar':
            return await this.handleGetSimilar(args as any);
          case 'search_help':
            return await this.handleSearchHelp();
          case 'quick_answers':
            return await this.handleQuickAnswers(args as any);
          case 'server_status':
            return await this.handleServerStatus();
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        this.log(`Tool execution error: ${error}`, 'error');
        throw error;
      }
    });
  }

  // === TOOL HANDLERS ===
  private async handleSmartSearch(args: {
    query: string;
    category?: string;
    maxResults?: number;
    fuzzyMatch?: boolean;
    sortBy?: string;
  }) {
    const options: SearchOptions = {
      query: args.query,
      maxResults: args.maxResults || 5,
      fuzzyMatch: args.fuzzyMatch !== false,
      sortBy:
        (args.sortBy as 'relevance' | 'priority' | 'alphabetical') ||
        'relevance',
    };

    // Only add category if it's not 'all' and not undefined
    if (args.category && args.category !== 'all') {
      options.category = args.category;
    }

    const results = await this.searchEngine.smartSearch(options);

    return {
      content: [
        {
          type: 'text',
          text: this.formatSmartSearchResults(args.query, results, options),
        },
      ],
    };
  }

  private async handleBrowseCategory(args: {
    category: string;
    query?: string;
  }) {
    const results = await this.searchEngine.searchByCategory(
      args.category,
      args.query
    );

    return {
      content: [
        {
          type: 'text',
          text: this.formatCategoryResults(args.category, results, args.query),
        },
      ],
    };
  }

  private async handleFindByTags(args: { tags: string[] }) {
    const results = await this.searchEngine.searchByTags(args.tags);

    return {
      content: [
        {
          type: 'text',
          text: this.formatTagResults(args.tags, results),
        },
      ],
    };
  }

  private async handleGetSimilar(args: { filename: string }) {
    const results = await this.searchEngine.findSimilarDocuments(args.filename);

    return {
      content: [
        {
          type: 'text',
          text: this.formatSimilarResults(args.filename, results),
        },
      ],
    };
  }

  private async handleSearchHelp() {
    const stats = this.searchEngine.getSearchStats();
    const categories = [...new Set(DOCUMENT_CATALOG.map(d => d.category))];
    const allTags = [...new Set(DOCUMENT_CATALOG.flatMap(d => d.tags))];

    return {
      content: [
        {
          type: 'text',
          text: this.formatSearchHelp(stats, categories, allTags),
        },
      ],
    };
  }

  private async handleQuickAnswers(args: { question_type: string }) {
    const quickAnswers: { [key: string]: QuickAnswer } = {
      how_to_start: {
        title: 'Getting Started',
        answer:
          'To get started with our services:\n1. Create your account\n2. Set up your virtual address\n3. Choose your mail handling preferences\n4. Start receiving mail!',
        relatedDocs: ['getting_started_guide.md', 'account_setup.md'],
      },
      how_create: {
        title: 'How to Create Account',
        answer:
          'Creating your PostScan Mail account is easy:\n1. Visit our website\n2. Click "Sign Up" or "Get Started"\n3. Fill in your personal information\n4. Choose your service plan\n5. Verify your email\n6. Set up your virtual mailbox address',
        relatedDocs: ['account_setup.md', 'getting_started_guide.md'],
      },
      pricing: {
        title: 'Pricing Information',
        answer:
          'Our pricing varies by service level. Basic plans start at $10.00/month for virtual mailroom services. Package handling and mail forwarding have additional fees based on usage.',
        relatedDocs: ['pricing_guide.md', 'billing_faq.md'],
      },
      support: {
        title: 'Contact Support',
        answer:
          'You can reach our support team through:\n- Email: support@postscanmail.com\n- Live chat on our website\n- Phone: 1-800-XXX-XXXX (business hours)\n- Help center with common solutions',
        relatedDocs: ['general_faq.md', 'troubleshooting.md'],
      },
      phone: {
        title: 'Phone Support',
        answer:
          'Our phone support is available at:\n 1-800-XXX-XXXX\n Business Hours: Monday-Friday 9AM-6PM EST\nFor after-hours support, please use our email or live chat options.',
        relatedDocs: ['general_faq.md'],
      },
      email: {
        title: 'Email Support',
        answer:
          'Email our support team at:\n support@postscanmail.com\n\nWe typically respond within 24 hours during business days. For urgent matters, please use live chat or phone support.',
        relatedDocs: ['general_faq.md'],
      },
      contact_support: {
        title: 'Contact Support',
        answer:
          'Multiple ways to reach our support team:\nEmail: support@postscanmail.com\nPhone: 1-800-XXX-XXXX (Mon-Fri 9AM-6PM EST)\nLive chat: Available on our website\nHelp center: Self-service solutions available 24/7',
        relatedDocs: ['general_faq.md', 'troubleshooting.md'],
      },
      support_contact: {
        title: 'Support Contact Information',
        answer:
          'Here are all the ways to contact our support team:\n\n**Email Support:**\nsupport@postscanmail.com\nResponse time: Within 24 hours\n\n**Phone Support:**\n1-800-XXX-XXXX\nHours: Monday-Friday 9AM-6PM EST\n\n**Live Chat:**\nAvailable on our website\nHours: Monday-Friday 9AM-6PM EST\n\n**Help Center:**\nSelf-service solutions available 24/7',
        relatedDocs: ['general_faq.md', 'troubleshooting.md'],
      },
      account_issues: {
        title: 'Account Issues',
        answer:
          'For account-related problems:\n1. Check your email for verification messages\n2. Try resetting your password\n3. Clear your browser cache\n4. Contact support if issues persist\n\nCommon solutions:\n- Password reset: Use "Forgot Password" link\n- Email verification: Check spam/junk folders\n- Login issues: Clear cookies and try incognito mode',
        relatedDocs: ['account_setup.md', 'troubleshooting.md'],
      },
    };

    const answer = quickAnswers[args.question_type];
    if (!answer) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown question type: ${args.question_type}`
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: `**${answer.title}**\n\n${answer.answer}\n\n**Related Documents:**\n${answer.relatedDocs.map((doc: string) => `- ${this.getDisplayName(doc)}`).join('\n')}\n\n*Use smart_search to find more detailed information about any of these topics.*`,
        },
      ],
    };
  }

  // === NEW SERVER STATUS TOOL ===
  private async handleServerStatus() {
    const stats = this.searchEngine.getSearchStats();

    let statusText = `**PostScan Mail MCP Server Status**\n\n`;

    statusText += `**Server Information:**\n`;
    statusText += `- Status: ${this.isReady ? 'Ready' : 'Not Ready'}\n`;
    statusText += `- Version: 2.0.0\n`;
    statusText += `- Indexed Documents: ${stats.indexedDocuments}\n`;
    statusText += `- Available Categories: ${stats.categories.length}\n\n`;

    if (this.configValidation) {
      statusText += `**MCP Configuration:**\n`;
      statusText += `- Validation: ${this.configValidation.isValid ? 'Valid' : 'Invalid'}\n`;
      if (this.configValidation.configPath) {
        statusText += `- Config File: ${this.configValidation.configPath}\n`;
      }
      if (this.configValidation.serverCount) {
        statusText += `- Configured Servers: ${this.configValidation.serverCount}\n`;
      }

      if (this.configValidation.warnings.length > 0) {
        statusText += `\n**Warnings:**\n`;
        this.configValidation.warnings.forEach(warning => {
          statusText += `- ${warning}\n`;
        });
      }
    }

    statusText += `\n**Search Statistics:**\n`;
    statusText += `- Total Tags: ${stats.totalTags}\n`;
    statusText += `- Avg Keywords/Doc: ${stats.avgKeywordsPerDoc.toFixed(1)}\n`;

    statusText += `\n**Document Catalog:**\n`;
    const categoryStats = DOCUMENT_CATALOG.reduce(
      (acc, doc) => {
        acc[doc.category] = (acc[doc.category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    Object.entries(categoryStats).forEach(([category, count]) => {
      statusText += `- ${category}: ${count} documents\n`;
    });

    return {
      content: [{ type: 'text', text: statusText }],
    };
  }

  // === RESULT FORMATTING ===
  private formatSmartSearchResults(
    query: string,
    results: SearchResult[],
    options: SearchOptions
  ): string {
    if (results.length === 0) {
      return this.formatNoResults(query, options);
    }

    const categoryText = options.category ? ` in ${options.category}` : '';
    const sortText =
      options.sortBy !== 'relevance' ? ` (sorted by ${options.sortBy})` : '';

    let output = `**Smart Search Results for "${query}"${categoryText}${sortText}**\n\n`;
    output += `Found ${results.length} relevant documents:\n\n`;

    results.forEach((result, index) => {
      const relevanceBar = this.createRelevanceBar(result.relevance);
      const matchTypesText =
        result.matchTypes.length > 0
          ? ` | Matched: ${result.matchTypes.join(', ')}`
          : '';

      output += `**${index + 1}. ${result.title}** ${result.priority}\n`;
      output += `*Category: ${result.category} | Relevance: ${relevanceBar} (${result.relevance})${matchTypesText}*\n`;
      output += `*Tags: ${result.tags.join(', ')}*\n\n`;
      output += `${result.snippet}\n\n`;
      output += `*Source: ${result.filename}*\n`;
      output += `---\n\n`;
    });

    output += `**Tips:**\n`;
    output += `- Use "get_similar" with any filename to find related documents\n`;
    output += `- Try "browse_category" to explore all ${options.category || 'available'} documents\n`;
    output += `- Use "find_by_tags" to search by specific topics\n`;

    return output;
  }

  private formatCategoryResults(
    category: string,
    results: SearchResult[],
    query?: string
  ): string {
    const queryText = query ? ` matching "${query}"` : '';

    let output = `** ${category.toUpperCase()} Documents${queryText}**\n\n`;

    if (results.length === 0) {
      output += `No documents found in ${category}${queryText}.\n\n`;
      output += `Available categories: ${[...new Set(DOCUMENT_CATALOG.map(d => d.category))].join(', ')}`;
      return output;
    }

    output += `Found ${results.length} documents:\n\n`;

    // Group by priority
    const groupedResults = results.reduce(
      (groups: { [key: string]: SearchResult[] }, result) => {
        const priority = result.priority.toString();
        if (!groups[priority]) groups[priority] = [];
        groups[priority].push(result);
        return groups;
      },
      {}
    );

    Object.keys(groupedResults)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .forEach(priority => {
        const priorityName =
          priority === '1'
            ? 'Core Documents'
            : priority === '2'
              ? 'Important Documents'
              : priority === '3'
                ? 'Reference Documents'
                : `Priority ${priority}`;

        output += `### ${priorityName}\n\n`;

        groupedResults[priority].forEach((result: SearchResult) => {
          output += `**${result.title}**\n`;
          output += `${result.description}\n`;
          output += `*Tags: ${result.tags.join(', ')}*\n`;
          output += `*File: ${result.filename}*\n\n`;
        });
      });

    return output;
  }

  private formatTagResults(tags: string[], results: SearchResult[]): string {
    let output = `** Documents Tagged: ${tags.join(', ')}**\n\n`;

    if (results.length === 0) {
      output += `No documents found with tags: ${tags.join(', ')}\n\n`;
      output += `**Available tags:**\n`;
      const allTags = [
        ...new Set(DOCUMENT_CATALOG.flatMap(d => d.tags)),
      ].sort();
      output += allTags.map((tag: string) => `- ${tag}`).join('\n');
      return output;
    }

    output += `Found ${results.length} documents:\n\n`;

    results.forEach((result, index) => {
      const matchingTags = result.tags.filter((tag: string) =>
        tags.some((searchTag: string) =>
          tag.toLowerCase().includes(searchTag.toLowerCase())
        )
      );

      output += `**${index + 1}. ${result.title}**\n`;
      output += `*Category: ${result.category} | Priority: ${result.priority}*\n`;
      output += `*Matching tags: ${matchingTags.join(', ')}*\n`;
      output += `*All tags: ${result.tags.join(', ')}*\n\n`;
      output += `${result.snippet}\n\n`;
      output += `* ${result.filename}*\n`;
      output += `---\n\n`;
    });

    return output;
  }

  private formatSimilarResults(
    filename: string,
    results: SearchResult[]
  ): string {
    const displayName = this.getDisplayName(filename);

    let output = `** Documents Similar to "${displayName}"**\n\n`;

    if (results.length === 0) {
      output += `No similar documents found for ${displayName}.\n\n`;
      output += `Try using smart_search with keywords from this document.`;
      return output;
    }

    output += `Found ${results.length} similar documents:\n\n`;

    results.forEach((result, index) => {
      output += `**${index + 1}. ${result.title}**\n`;
      output += `*Category: ${result.category} | Similarity: ${result.relevance}*\n`;
      output += `*Common topics: ${result.tags.join(', ')}*\n\n`;
      output += `${result.snippet}\n\n`;
      output += `* ${result.filename}*\n`;
      output += `---\n\n`;
    });

    return output;
  }

  private formatSearchHelp(
    stats: any,
    categories: string[],
    allTags: string[]
  ): string {
    return (
      `**Advanced Search Help**\n\n` +
      `**Search Statistics:**\n` +
      `- Indexed documents: ${stats.indexedDocuments}\n` +
      `- Categories: ${stats.categories.length}\n` +
      `- Total tags: ${stats.totalTags}\n` +
      `- Avg keywords per document: ${stats.avgKeywordsPerDoc.toFixed(1)}\n\n` +
      `**Available Categories:**\n` +
      categories
        .map(
          (cat: string) =>
            `- **${cat}**: ${DOCUMENT_CATALOG.filter(d => d.category === cat).length} documents`
        )
        .join('\n') +
      '\n\n' +
      `**Search Features:**\n` +
      `- **Smart Search**: Natural language queries with relevance ranking\n` +
      `- **Category Filtering**: Search within specific document types\n` +
      `- **Tag-based Search**: Find documents by topics\n` +
      `- **Fuzzy Matching**: Handles typos and similar words\n` +
      `- **Similar Documents**: Find related content\n\n` +
      `**Popular Tags:**\n` +
      allTags
        .slice(0, 20)
        .map((tag: string) => `- ${tag}`)
        .join('\n') +
      '\n\n' +
      `**Search Tips:**\n` +
      `- Use natural language: "How do I forward my mail?"\n` +
      `- Combine terms: "billing payment issues"\n` +
      `- Use categories to narrow results\n` +
      `- Try fuzzy matching for typos\n` +
      `- Check similar documents for related info\n\n` +
      `**Quick Commands:**\n` +
      `- Browse services: browse_category with category="services"\n` +
      `- Find setup docs: find_by_tags with tags=["setup", "guide"]\n` +
      `- Get help: Use quick_answers for common questions\n` +
      `- Check server: Use server_status for system information`
    );
  }

  private formatNoResults(query: string, options: SearchOptions): string {
    const suggestions = [
      'Try different keywords or simpler terms',
      'Check spelling of your search terms',
      'Use broader search terms',
      'Try searching without category filter',
      'Browse categories to explore available content',
    ];

    if (options.category) {
      suggestions.push(
        `Try searching in all categories instead of just ${options.category}`
      );
    }

    return (
      `**No results found for "${query}"**\n\n` +
      `**Suggestions:**\n` +
      suggestions.map(s => `- ${s}`).join('\n') +
      '\n\n' +
      `**Available categories:** ${[...new Set(DOCUMENT_CATALOG.map(d => d.category))].join(', ')}\n\n` +
      `**Try these commands:**\n` +
      `- search_help: Get detailed search guidance\n` +
      `- browse_category: Explore documents by category\n` +
      `- quick_answers: Get answers to common questions`
    );
  }

  private createRelevanceBar(relevance: number): string {
    const maxBars = 5;
    const normalizedRelevance = Math.min(relevance / 50, 1); // Normalize to 0-1
    const filledBars = Math.round(normalizedRelevance * maxBars);
    return '*'.repeat(filledBars) + '-'.repeat(maxBars - filledBars);
  }

  // === UTILITY METHODS ===
  private async getContent(filename: string): Promise<string> {
    if (this.contentCache.has(filename)) {
      return this.contentCache.get(filename)!;
    }

    const response = await fetch(`${BASE_URL}${filename}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();
    this.contentCache.set(filename, content);
    return content;
  }

  private getDisplayName(filename: string): string {
    return filename
      .replace('.md', '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  private log(message: string, level: 'info' | 'error' = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '[ERROR]' : '[INFO]';
    console.error(`${prefix} ${timestamp} ${message}`);
  }

  // === ENHANCED SERVER STARTUP ===
  async run() {
    try {
      // Initialize with validation
      await this.initialize();

      // Connect transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      this.log(` ${COMPANY_NAME} Enhanced MCP server running on stdio`);
      this.log(
        `Serving ${DOCUMENT_CATALOG.length} documents with advanced search`
      );
      this.log(`All systems ready`);
    } catch (error) {
      this.log(`Failed to start server: ${getErrorMessage(error)}`, 'error');
      this.log(`\n Troubleshooting tips:`, 'error');
      this.log(
        `1. Check your claude_desktop_config.json file exists and is valid`,
        'error'
      );
      this.log(`2. Ensure MCP servers are properly configured`, 'error');
      this.log(
        `3. Restart Claude Desktop after configuration changes`,
        'error'
      );
      this.log(`4. Check file permissions on config directory`, 'error');

      throw error;
    }
  }
}

// === START THE SERVER ===
// Only start the server if this file is run directly (not imported)
// For ES modules, we check if this is the main module being executed
const currentFilePath = new URL(import.meta.url).pathname;
const mainFilePath = process.argv[1];
const isMainModule =
  currentFilePath.endsWith(mainFilePath.replace(/\\/g, '/')) ||
  process.argv[1].includes('index.js');

if (isMainModule) {
  const server = new EnhancedMCPServer();
  server.run().catch(error => {
    console.error('Fatal error starting server:', error);
    process.exit(1);
  });
} else {
  // Module imported - server not started automatically
}

// Export the server class for testing
export { AdvancedSearchEngine, EnhancedMCPServer, MCPConfigValidator };
