// src/index.ts - Unified MCP Server with Remote Document Search
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

// === UTILITY FUNCTIONS ===
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// === DOCUMENT INTERFACES ===
interface DocumentMetadata {
  filename: string;
  url: string;
  title: string;
  category: string;
  tags: string[];
  keywords: string[];
  summary: string;
  wordCount: number;
  fileType: string;
}

interface SearchOptions {
  query: string;
  category?: string;
  maxResults?: number;
  fuzzyMatch?: boolean;
}

interface SearchResult {
  filename: string;
  title: string;
  category: string;
  snippet: string;
  relevanceScore: number;
  tags: string[];
  matchedTerms: string[];
  url: string;
  isBriefMention?: boolean; // Flag for lower-ranked results
}

// === UNIFIED SEARCH ENGINE ===
class UnifiedSearchEngine {
  private documentsIndex: Map<string, DocumentMetadata> = new Map();
  private contentCache: Map<string, string> = new Map();
  private baseUrl: string;
  private isIndexBuilt: boolean = false;

  // Known documents from the PostScan Mail site
  private knownDocuments: string[] = [
    'pricing.md',
    'virtual_po_box.md',
    'virtual_mailroom.md',
    'virtual_address_llc.md',
    'registered_agent.md',
    'mail_forwarding.md',
    'package_receiving_forwarding.md',
    'change_mailing_address.md',
    'expats_international.md',
    'business_personal_storage.md',
    // Add more documents as they become available
  ];

  constructor(
    baseUrl: string = 'https://www.postscanmail.com/tools/markdown/'
  ) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  }

  // === BUILD INDEX FROM REMOTE DOCUMENTS ===
  async buildIndex(): Promise<void> {
    console.error('[INFO] Building search index from remote documents...');

    // Clear existing cache to force fresh data
    this.contentCache.clear();
    this.documentsIndex.clear();

    for (const filename of this.knownDocuments) {
      await this.indexRemoteDocument(filename);
    }

    this.isIndexBuilt = true;
    console.error(`[INFO] Index built: ${this.documentsIndex.size} documents`);
  }

  private async indexRemoteDocument(filename: string): Promise<void> {
    try {
      const url = `${this.baseUrl}${filename}`;
      console.error(`[INFO] Fetching: ${url}`);

      const response = await fetch(url, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();
      const metadata = this.extractMetadata(filename, content, url);

      this.documentsIndex.set(filename, metadata);
      this.contentCache.set(filename, content);

      console.error(`[INFO] Indexed: ${filename} (${content.length} chars)`);
    } catch (error) {
      console.error(
        `[WARN] Failed to index ${filename}: ${getErrorMessage(error)}`
      );
    }
  }

  private extractMetadata(
    filename: string,
    content: string,
    url: string
  ): DocumentMetadata {
    // Extract title from content or filename
    let title = this.extractTitle(content);
    if (!title) {
      title = filename
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    }

    // Determine category from filename
    const category = this.determineCategory(filename);

    // Extract tags from filename and content
    const tags = this.extractTags(filename, content);

    // Extract keywords
    const keywords = this.extractKeywords(content);

    // Create summary
    const summary = this.createSummary(content);

    // Count words
    const wordCount = content
      .split(/\s+/)
      .filter(word => word.length > 0).length;

    // Determine file type
    const fileType = filename.endsWith('.md')
      ? 'markdown'
      : filename.endsWith('.json')
        ? 'json'
        : 'text';

    return {
      filename,
      url,
      title,
      category,
      tags,
      keywords,
      summary,
      wordCount,
      fileType,
    };
  }

  private extractTitle(content: string): string | null {
    // Look for markdown H1 header
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }
    return null;
  }

  private determineCategory(filename: string): string {
    const name = filename.toLowerCase();

    if (
      name.includes('mail') ||
      name.includes('mailing') ||
      name.includes('service') ||
      name.includes('virtual') ||
      name.includes('mailroom') ||
      name.includes('forwarding') ||
      name.includes('receiving') ||
      name.includes('package') ||
      name.includes('mailbox') ||
      name.includes('po box') ||
      name.includes('address') ||
      name.includes('registered') ||
      name.includes('agent') ||
      name.includes('virtual') ||
      name.includes('office') ||
      name.includes('storage')
    ) {
      return 'services';
    }
    if (
      name.includes('faq') ||
      name.includes('help') ||
      name.includes('support') ||
      name.includes('troubleshooting') ||
      name.includes('contact') ||
      name.includes('issue') ||
      name.includes('billing') ||
      name.includes('invoice')
    ) {
      return 'support';
    }
    if (
      [
        'price',
        'cost',
        'subscription',
        'payment',
        'how much',
        'pricing',
        'quote',
        'estimate',
        'fee',
      ].some(term => name.includes(term))
    ) {
      return 'pricing';
    }
    if (
      name.includes('setup') ||
      name.includes('sign up') ||
      name.includes('signup') ||
      name.includes('registration') ||
      name.includes('guide')
    ) {
      return 'onboarding';
    }

    return 'general';
  }

  private extractTags(filename: string, content: string): string[] {
    const tags = new Set<string>();

    // Add category as tag
    tags.add(this.determineCategory(filename));

    // Extract from filename
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    nameWithoutExt.split(/[_-]/).forEach(part => {
      if (part.length > 2) {
        tags.add(part.toLowerCase());
      }
    });

    // Extract from markdown headers
    const headers = content.match(/^#{2,6}\s+(.+)$/gm) || [];
    headers.forEach(header => {
      const text = header.replace(/^#+\s+/, '').toLowerCase();
      if (text.length < 30) {
        const words = text.split(/\s+/).filter(word => word.length > 3);
        words.forEach(word => tags.add(word));
      }
    });

    return Array.from(tags).filter(tag => tag.length > 1);
  }

  private extractKeywords(content: string): string[] {
    // Remove markdown syntax and extract meaningful words
    const cleanContent = content
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '') // Remove inline code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Extract link text
      .replace(/[#*_`\[\]()]/g, ' ') // Remove markdown syntax
      .toLowerCase();

    const words = cleanContent
      .split(/\s+/)
      .filter(word => word.length > 3 && !this.isStopWord(word));

    // Extract pricing and fee-related terms (important for pricing documents)
    const pricingTerms = this.extractPricingTerms(content);

    // Extract section headers as keywords
    const headerKeywords = this.extractHeaderKeywords(content);

    // Count frequency
    const wordFreq: { [key: string]: number } = {};

    // Add regular words
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    // Add pricing terms with higher weight
    pricingTerms.forEach(term => {
      wordFreq[term] = (wordFreq[term] || 0) + 3;
    });

    // Add header keywords with higher weight
    headerKeywords.forEach(keyword => {
      wordFreq[keyword] = (wordFreq[keyword] || 0) + 2;
    });

    // Return top keywords
    return Object.entries(wordFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20) // Increased from 15 to capture more pricing terms
      .map(([word]) => word);
  }

  private extractPricingTerms(content: string): string[] {
    const pricingTerms = new Set<string>();

    // Common pricing patterns
    const patterns = [
      /\$[\d.,]+/g, // Dollar amounts
      /[\d.]+\s*(?:per|\/)\s*\w+/gi, // Per unit pricing
      /additional\s+\w+/gi, // Additional fees
      /extra\s+\w+/gi, // Extra charges
      /storage\s+fee/gi, // Storage fees
      /processing\s+fee/gi, // Processing fees
      /forwarding\s+fee/gi, // Forwarding fees
      /package\s+\w+/gi, // Package services
      /mail\s+\w+/gi, // Mail services
      /recipient\s+\w*/gi, // Recipient services
      /mailbox\s+\w*/gi, // Mailbox services
    ];

    patterns.forEach(pattern => {
      const matches = content.match(pattern) || [];
      matches.forEach(match => {
        const cleaned = match
          .toLowerCase()
          .replace(/[^\w\s$./]/g, '')
          .trim();
        if (cleaned.length > 2) {
          pricingTerms.add(cleaned);
        }
      });
    });

    return Array.from(pricingTerms);
  }

  private extractHeaderKeywords(content: string): string[] {
    const headers = content.match(/^#{1,6}\s+(.+)$/gm) || [];
    const keywords = new Set<string>();

    headers.forEach(header => {
      const text = header.replace(/^#+\s+/, '').toLowerCase();
      const words = text
        .split(/\s+/)
        .filter(word => word.length > 2 && !this.isStopWord(word));
      words.forEach(word => keywords.add(word));
    });

    return Array.from(keywords);
  }

  private createSummary(content: string): string {
    // Get first meaningful paragraph
    const paragraphs = content
      .replace(/^---[\s\S]*?---/m, '') // Remove frontmatter
      .replace(/^#{1,6}\s+.*$/gm, '') // Remove headers
      .split('\n\n')
      .map(p => p.trim())
      .filter(p => p.length > 50);

    const summary = paragraphs[0] || content.substring(0, 200);
    return summary.substring(0, 300) + (summary.length > 300 ? '...' : '');
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
    ]);
    return stopWords.has(word);
  }

  // === UNIFIED SEARCH METHOD ===
  async search(options: SearchOptions): Promise<SearchResult[]> {
    if (!this.isIndexBuilt) {
      await this.buildIndex();
    }

    const { query, category, maxResults = 10, fuzzyMatch = true } = options;

    console.error(`[INFO] Searching for: "${query}"`);

    const searchTerms = this.preprocessQuery(query);
    const results: SearchResult[] = [];

    for (const [filename, metadata] of this.documentsIndex) {
      // Apply category filter
      if (category && metadata.category !== category) continue;

      // Calculate relevance
      const relevance = this.calculateRelevance(
        metadata,
        searchTerms,
        fuzzyMatch
      );

      if (relevance.score > 0) {
        const content = this.contentCache.get(filename) || '';

        results.push({
          filename: metadata.filename,
          title: metadata.title,
          category: metadata.category,
          snippet: this.generateSnippet(content, searchTerms),
          relevanceScore: relevance.score,
          tags: metadata.tags,
          matchedTerms: relevance.matchedTerms,
          url: metadata.url,
        });
      }
    }

    // Sort by relevance score
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Instead of cutting off lower-ranked results, include them with brief mentions
    const primaryResults = results.slice(0, maxResults);
    const remainingResults = results.slice(maxResults);

    // Add brief mentions of remaining results if any exist
    if (remainingResults.length > 0) {
      const briefMentions = remainingResults.map(result => ({
        ...result,
        snippet: `${result.title} - ${result.snippet.substring(0, 100)}...`,
        isBriefMention: true,
      }));

      // Combine primary results with brief mentions
      return [...primaryResults, ...briefMentions];
    }

    return primaryResults;
  }

  private preprocessQuery(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2 && !this.isStopWord(term));
  }

  private calculateRelevance(
    metadata: DocumentMetadata,
    searchTerms: string[],
    fuzzyMatch: boolean
  ): { score: number; matchedTerms: string[] } {
    let score = 0;
    const matchedTerms: string[] = [];

    // Get the actual content for more accurate scoring
    const content = this.contentCache.get(metadata.filename) || '';
    const contentLower = content.toLowerCase();

    for (const term of searchTerms) {
      let termScore = 0;

      // Title matches (highest weight)
      if (metadata.title.toLowerCase().includes(term)) {
        termScore += 50;
        matchedTerms.push(`title:${term}`);
      }

      // Filename matches
      if (metadata.filename.toLowerCase().includes(term)) {
        termScore += 30;
        matchedTerms.push(`filename:${term}`);
      }

      // Category matches
      if (metadata.category.toLowerCase().includes(term)) {
        termScore += 25;
        matchedTerms.push(`category:${term}`);
      }

      // Content header matches (new - high priority for structured content)
      const headerMatches = content.match(
        new RegExp(`^#{1,6}\\s+[^\\n]*${term}[^\\n]*$`, 'gmi')
      );
      if (headerMatches && headerMatches.length > 0) {
        termScore += 40;
        matchedTerms.push(`header:${term}`);
      }

      // Content frequency matches (new - important for comprehensive content)
      const contentMatches = contentLower.split(term).length - 1;
      if (contentMatches > 0) {
        // Score based on frequency, but with diminishing returns
        const frequencyScore = Math.min(contentMatches * 8, 35);
        termScore += frequencyScore;
        matchedTerms.push(`content:${term}(${contentMatches}x)`);
      }

      // Tag matches
      for (const tag of metadata.tags) {
        if (tag.includes(term) || (fuzzyMatch && this.fuzzyMatch(tag, term))) {
          termScore += 20;
          matchedTerms.push(`tag:${tag}`);
          break;
        }
      }

      // Keyword matches
      for (const keyword of metadata.keywords) {
        if (
          keyword.includes(term) ||
          (fuzzyMatch && this.fuzzyMatch(keyword, term))
        ) {
          termScore += 15;
          matchedTerms.push(`keyword:${keyword}`);
          break;
        }
      }

      // Summary matches
      if (metadata.summary.toLowerCase().includes(term)) {
        termScore += 10;
        matchedTerms.push(`summary:${term}`);
      }

      // List item matches (new - for pricing tables and structured lists)
      const listMatches = content.match(
        new RegExp(`^\\s*[-*•]\\s+[^\\n]*${term}[^\\n]*$`, 'gmi')
      );
      if (listMatches && listMatches.length > 0) {
        termScore += 25;
        matchedTerms.push(`list:${term}`);
      }

      score += termScore;
    }

    return {
      score: Math.round(score),
      matchedTerms: [...new Set(matchedTerms)],
    };
  }

  private fuzzyMatch(text: string, term: string): boolean {
    if (text.length < term.length) return false;
    const threshold = Math.floor(term.length * 0.3);
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

  private generateSnippet(content: string, searchTerms: string[]): string {
    // Enhanced snippet generation for structured content
    const allSnippets: { text: string; score: number }[] = [];

    // Method 1: Find sections by headers (for structured content like pricing)
    const sections = this.findRelevantSections(content, searchTerms);
    sections.forEach(section => {
      allSnippets.push({
        text: section.content,
        score: section.score + 50, // Bonus for section matches
      });
    });

    // Method 2: Find paragraph blocks
    const paragraphs = content.split(/\n\s*\n/);
    paragraphs.forEach(paragraph => {
      const trimmed = paragraph.trim();
      if (trimmed.length < 30) return;

      const score = this.calculateSnippetScore(trimmed, searchTerms);
      if (score > 0) {
        allSnippets.push({ text: trimmed, score });
      }
    });

    // Method 3: Find sentence groups (fallback)
    if (allSnippets.length === 0) {
      const sentences = content.split(/[.!?]+/);
      for (let i = 0; i < sentences.length - 1; i++) {
        const snippet = sentences
          .slice(i, i + 3)
          .join('. ')
          .trim();
        if (snippet.length < 50) continue;

        const score = this.calculateSnippetScore(snippet, searchTerms);
        if (score > 0) {
          allSnippets.push({ text: snippet, score });
        }
      }
    }

    // If no matches found, return beginning of content
    if (allSnippets.length === 0) {
      return content.substring(0, 400) + '...';
    }

    // Sort by score and combine top snippets
    allSnippets.sort((a, b) => b.score - a.score);

    // Take top snippets but avoid duplication
    const topSnippets = this.deduplicateSnippets(allSnippets.slice(0, 3));

    // Combine snippets with highlighting
    let result = topSnippets
      .map(snippet => this.highlightTerms(snippet.text, searchTerms))
      .join('\n\n---\n\n');

    // Limit total length (increased for pricing content)
    if (result.length > 1500) {
      result = result.substring(0, 1500) + '...';
    }

    return result;
  }

  private findRelevantSections(
    content: string,
    searchTerms: string[]
  ): { content: string; score: number }[] {
    const sections: { content: string; score: number }[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check if this line is a header that matches search terms
      if (line.match(/^#{1,6}\s+/) || line.match(/^[A-Z][^a-z]*$/)) {
        const headerScore = this.calculateSnippetScore(line, searchTerms);

        if (headerScore > 0) {
          // Include the header and following content
          let sectionContent = line + '\n';
          let j = i + 1;

          // Collect content until next header or end
          while (j < lines.length) {
            const nextLine = lines[j].trim();

            // Stop at next major header (same level or higher)
            // For ## headers, stop at # or ##
            // For ### headers, stop at #, ##, or ###
            const currentHeaderLevel = (line.match(/^(#+)/) || ['', ''])[1]
              .length;
            const nextHeaderMatch = nextLine.match(/^(#+)\s+/);

            if (nextHeaderMatch) {
              const nextHeaderLevel = nextHeaderMatch[1].length;
              // Stop if we hit a header at the same level or higher (lower number = higher level)
              if (nextHeaderLevel <= currentHeaderLevel) {
                break;
              }
            } else if (
              nextLine.match(/^[A-Z][^a-z]*$/) &&
              nextLine.length > 3 &&
              !nextLine.includes('$') &&
              currentHeaderLevel <= 2
            ) {
              // Stop at ALL CAPS headers only if we're at a high level
              break;
            }

            sectionContent += lines[j] + '\n';
            j++;

            // Limit section size (increased for comprehensive pricing sections)
            if (sectionContent.length > 1200) break;
          }

          sections.push({
            content: sectionContent.trim(),
            score:
              headerScore +
              this.calculateSnippetScore(sectionContent, searchTerms),
          });
        }
      }
    }

    return sections;
  }

  private calculateSnippetScore(text: string, searchTerms: string[]): number {
    let score = 0;
    const lowerText = text.toLowerCase();

    searchTerms.forEach(term => {
      const termLower = term.toLowerCase();

      // Exact matches get higher score
      const exactMatches = lowerText.split(termLower).length - 1;
      score += exactMatches * 10;

      // Partial matches
      if (lowerText.includes(termLower)) {
        score += 5;
      }

      // Bonus for matches in titles/headers
      if (text.match(/^#{1,6}\s+/) && lowerText.includes(termLower)) {
        score += 20;
      }
    });

    return score;
  }

  private deduplicateSnippets(
    snippets: { text: string; score: number }[]
  ): { text: string; score: number }[] {
    const seen = new Set<string>();
    return snippets.filter(snippet => {
      const normalized = snippet.text.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }

  private highlightTerms(text: string, searchTerms: string[]): string {
    let highlighted = text;
    searchTerms.forEach(term => {
      const regex = new RegExp(
        `(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
        'gi'
      );
      highlighted = highlighted.replace(regex, '**$1**');
    });
    return highlighted;
  }

  // === UTILITY METHODS ===
  getDocument(filename: string): string | undefined {
    return this.contentCache.get(filename);
  }

  getMetadata(filename: string): DocumentMetadata | undefined {
    return this.documentsIndex.get(filename);
  }
}

// === MCP SERVER ===
class UnifiedMCPServer {
  private server: Server;
  private searchEngine: UnifiedSearchEngine;

  constructor() {
    this.server = new Server(
      {
        name: 'postscanmail-unified-search',
        version: '3.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.searchEngine = new UnifiedSearchEngine();
    this.setupHandlers();
  }

  private setupHandlers() {
    // === RESOURCES ===
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      await this.ensureIndexBuilt();

      const allDocs = Array.from(this.searchEngine['documentsIndex'].values());

      return {
        resources: allDocs.map(doc => ({
          uri: `postscan://${doc.filename}`,
          mimeType:
            doc.fileType === 'markdown' ? 'text/markdown' : 'text/plain',
          name: doc.title,
          description: `${doc.category} | ${doc.tags.join(', ')} | ${doc.wordCount} words`,
          annotations: {
            category: doc.category,
            tags: doc.tags.join(', '),
            url: doc.url,
          },
        })),
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async request => {
      await this.ensureIndexBuilt();

      const filename = request.params.uri.replace('postscan://', '');
      const content = this.searchEngine.getDocument(filename);
      const metadata = this.searchEngine.getMetadata(filename);

      if (!content || !metadata) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Resource not found: ${filename}`
        );
      }

      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType:
              metadata.fileType === 'markdown' ? 'text/markdown' : 'text/plain',
            text: content,
            annotations: {
              title: metadata.title,
              category: metadata.category,
              tags: metadata.tags.join(', '),
              wordCount: metadata.wordCount.toString(),
              url: metadata.url,
            },
          },
        ],
      };
    });

    // === ADVANCED TOOLS WITH INTENT DETECTION ===
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'intelligent_search',
            description: `CRITICAL INSTRUCTIONS FOR LLM AGENT:

🎯 PURPOSE: This tool searches PostScan Mail's official documentation. You MUST follow these rules:

📋 BEFORE USING THIS TOOL:
1. ANALYZE the user's question to understand their intent
2. If the question is unclear, vague, or missing context, ASK for clarification BEFORE searching
3. If the question is not related to PostScan Mail services, politely redirect them

🔍 SEARCH STRATEGY:
- Use specific, relevant keywords from the user's question
- Choose the most appropriate category based on intent
- Start with broad searches, then narrow down if needed

⚠️ CRITICAL HALLUCINATION PREVENTION:
- ONLY provide information found in the search results
- If no relevant results are found, say "I don't have information about that in our documentation"
- NEVER make up information, prices, policies, or procedures
- NEVER assume or extrapolate beyond what's explicitly stated in the results
- If results are partial or unclear, ask the user to be more specific

🎯 INTENT CATEGORIES:
- services: Questions about mail forwarding, virtual mailbox, package handling, virtual mailing address, registered agent services, etc.
- support: Technical issues, account problems, troubleshooting
- pricing: Costs, monthly subscription, fees, subscription, how much
- onboarding: Getting started, account setup, initial configuration
- general: Company info, policies, FAQ, contact information

✅ GOOD EXAMPLES:
- "How do I forward my mail?" → search for mail forwarding
- "What are your pricing plans?" → search pricing category
- "I can't log into my account" → search support for login issues

❌ BAD EXAMPLES:
- Vague: "How does this work?" → ASK: "What specific service are you asking about?"
- Off-topic: "What's the weather?" → REDIRECT: "I can only help with PostScan Mail services"
- Assuming: Don't search for "How to cancel" if user asked "How to pause"

🔄 FOLLOW-UP STRATEGY:
- If initial search doesn't find relevant info, try different keywords
- If still no results, admit the limitation: "I don't see information about that specific topic"
- Suggest contacting support for topics not covered in documentation`,

            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'Specific search query based on user intent analysis. Use clear, relevant keywords.',
                  minLength: 3,
                  maxLength: 200,
                },
                category: {
                  type: 'string',
                  description: 'Category that best matches the user intent',
                  enum: [
                    'services',
                    'support',
                    'pricing',
                    'onboarding',
                    'general',
                  ],
                },
                intent_analysis: {
                  type: 'string',
                  description:
                    'Brief explanation of detected user intent (for logging/debugging)',
                  maxLength: 100,
                },
                confidence_level: {
                  type: 'string',
                  description: 'How confident you are about the user intent',
                  enum: ['high', 'medium', 'low'],
                },
                maxResults: {
                  type: 'number',
                  description: 'Maximum results to return',
                  default: 8,
                  minimum: 1,
                  maximum: 15,
                },
                fuzzyMatch: {
                  type: 'boolean',
                  description: 'Enable fuzzy matching for typos',
                  default: true,
                },
              },
              required: [
                'query',
                'category',
                'intent_analysis',
                'confidence_level',
              ],
            },
          },
          {
            name: 'clarify_intent',
            description: `Use this tool when the user's question is unclear, ambiguous, or lacks context.
            
WHEN TO USE:
- Question is too vague ("How does this work?")
- Missing important context ("Can I change it?")
- Multiple possible interpretations
- Question seems off-topic
- User seems confused about our services

This tool helps you ask targeted clarifying questions before searching.`,

            inputSchema: {
              type: 'object',
              properties: {
                unclear_question: {
                  type: 'string',
                  description: 'The original unclear question from the user',
                },
                clarification_needed: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                  description:
                    'List of specific things that need clarification',
                  minItems: 1,
                  maxItems: 5,
                },
                suggested_questions: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                  description: 'Specific clarifying questions to ask the user',
                  minItems: 1,
                  maxItems: 3,
                },
              },
              required: [
                'unclear_question',
                'clarification_needed',
                'suggested_questions',
              ],
            },
          },
          {
            name: 'validate_response',
            description: `INTERNAL VALIDATION TOOL - Use this to check if your planned response contains only verified information from search results.

Use this BEFORE providing your final answer to ensure no hallucination.`,

            inputSchema: {
              type: 'object',
              properties: {
                planned_response: {
                  type: 'string',
                  description: 'The response you plan to give to the user',
                },
                search_results_summary: {
                  type: 'string',
                  description:
                    'Summary of what was actually found in search results',
                },
                confidence_check: {
                  type: 'string',
                  enum: ['verified', 'partially_verified', 'unverified'],
                  description:
                    'How well your response is supported by search results',
                },
              },
              required: [
                'planned_response',
                'search_results_summary',
                'confidence_check',
              ],
            },
          },
          {
            name: 'escalate_to_human',
            description: `Use when you cannot help the user based on available documentation.
            
WHEN TO USE:
- No relevant information found after thorough searching
- User needs personalized account assistance
- Technical issues beyond general troubleshooting
- Billing or payment specific to their account
- Refund requests, Cancellations
- Complex scenarios not covered in documentation`,

            inputSchema: {
              type: 'object',
              properties: {
                user_question: {
                  type: 'string',
                  description: 'Original user question',
                },
                searches_attempted: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                  description: 'List of search queries that were tried',
                },
                escalation_reason: {
                  type: 'string',
                  enum: [
                    'no_documentation_found',
                    'requires_account_access',
                    'technical_issue_beyond_docs',
                    'billing_account_specific',
                    'complex_scenario',
                  ],
                },
                contact_recommendation: {
                  type: 'string',
                  enum: [
                    'email_support',
                    'phone_support',
                    'live_chat',
                    'help_center',
                  ],
                },
              },
              required: [
                'user_question',
                'searches_attempted',
                'escalation_reason',
                'contact_recommendation',
              ],
            },
          },
          {
            name: 'refresh_cache',
            description: `Manually refresh the document cache from remote server.
            
Use this when you need to fetch the latest content from the remote documentation.`,

            inputSchema: {
              type: 'object',
              properties: {
                force_refresh: {
                  type: 'boolean',
                  description: 'Force a complete cache refresh',
                  default: true,
                },
              },
            },
          },
        ],
      };
    });

    // === ENHANCED TOOL HANDLERS ===
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      if (!args) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `No arguments provided for tool: ${name}`
        );
      }

      console.error(`[INFO] Executing intelligent tool: ${name}`);

      try {
        switch (name) {
          case 'intelligent_search':
            return await this.handleIntelligentSearch(args as any);
          case 'clarify_intent':
            return await this.handleClarifyIntent(args as any);
          case 'validate_response':
            return await this.handleValidateResponse(args as any);
          case 'escalate_to_human':
            return await this.handleEscalateToHuman(args as any);
          case 'refresh_cache':
            return await this.handleRefreshCache(args as any);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        console.error(
          `[ERROR] Tool execution error: ${getErrorMessage(error)}`
        );
        throw error;
      }
    });
  }

  private async ensureIndexBuilt(): Promise<void> {
    if (!this.searchEngine['isIndexBuilt']) {
      await this.searchEngine.buildIndex();
    }
  }

  // === TOOL HANDLER IMPLEMENTATIONS ===
  private async handleIntelligentSearch(args: {
    query: string;
    category: string;
    intent_analysis: string;
    confidence_level: string;
    maxResults?: number;
    fuzzyMatch?: boolean;
  }) {
    // Log the intent analysis for debugging
    console.error(
      `[INFO] Intent Analysis: ${args.intent_analysis} (Confidence: ${args.confidence_level})`
    );

    // Validate query quality
    if (args.query.length < 3) {
      return {
        content: [
          {
            type: 'text',
            text: "⚠️ Search query too short. Please provide more specific keywords about what you're looking for.",
          },
        ],
      };
    }

    // Perform the search using existing search engine
    const searchOptions: SearchOptions = {
      query: args.query,
      category: args.category,
      maxResults: args.maxResults || 8,
      fuzzyMatch: args.fuzzyMatch !== false,
    };

    const results = await this.searchEngine.search(searchOptions);

    // Enhanced result formatting with hallucination prevention
    return {
      content: [
        {
          type: 'text',
          text: this.formatIntelligentSearchResults(args, results),
        },
      ],
    };
  }

  private async handleClarifyIntent(args: {
    unclear_question: string;
    clarification_needed: string[];
    suggested_questions: string[];
  }) {
    let response = `I need to better understand your question to help you effectively.\n\n`;
    response += `**Your question:** "${args.unclear_question}"\n\n`;
    response += `**To provide accurate information, I need clarification on:**\n`;

    args.clarification_needed.forEach((item, index) => {
      response += `${index + 1}. ${item}\n`;
    });

    response += `\n**Could you please tell me:**\n`;
    args.suggested_questions.forEach(question => {
      response += `• ${question}\n`;
    });

    response += `\nThis will help me search our documentation more effectively and give you the most accurate information.`;

    return {
      content: [
        {
          type: 'text',
          text: response,
        },
      ],
    };
  }

  private async handleValidateResponse(args: {
    planned_response: string;
    search_results_summary: string;
    confidence_check: string;
  }) {
    let validation = `**RESPONSE VALIDATION CHECK**\n\n`;
    validation += `**Planned Response:** ${args.planned_response.substring(0, 200)}...\n\n`;
    validation += `**Search Results Found:** ${args.search_results_summary}\n\n`;
    validation += `**Confidence Level:** ${args.confidence_check}\n\n`;

    if (args.confidence_check === 'unverified') {
      validation += `🚨 **WARNING:** Response contains unverified information. Do not provide this response.\n`;
      validation += `**Action:** Either search for more specific information or admit the limitation.\n`;
    } else if (args.confidence_check === 'partially_verified') {
      validation += `⚠️ **CAUTION:** Response partially supported by documentation.\n`;
      validation += `**Action:** Clearly indicate which parts are verified and which need confirmation.\n`;
    } else {
      validation += `✅ **VERIFIED:** Response is well-supported by documentation.\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: validation,
        },
      ],
    };
  }

  private async handleEscalateToHuman(args: {
    user_question: string;
    searches_attempted: string[];
    escalation_reason: string;
    contact_recommendation: string;
  }) {
    let response = `I understand you need help with: "${args.user_question}"\n\n`;

    response += `I've searched our documentation using these terms:\n`;
    args.searches_attempted.forEach(search => {
      response += `• ${search}\n`;
    });

    response += `\nUnfortunately, I don't have specific information about this in our available documentation. `;

    switch (args.escalation_reason) {
      case 'no_documentation_found':
        response += `This topic isn't covered in our current help documents.\n`;
        break;
      case 'requires_account_access':
        response += `This requires access to your specific account information.\n`;
        break;
      case 'technical_issue_beyond_docs':
        response += `This appears to be a technical issue that needs personalized troubleshooting.\n`;
        break;
      case 'billing_account_specific':
        response += `This involves billing details specific to your account.\n`;
        break;
      case 'complex_scenario':
        response += `This situation requires personalized assistance.\n`;
        break;
    }

    response += `\n**I recommend contacting our support team:**\n\n`;

    switch (args.contact_recommendation) {
      case 'email_support':
        response += `📧 **Email Support:** support@postscanmail.com\n`;
        response += `• Best for detailed questions or account-specific issues\n`;
        response += `• Response within 24 hours during business days\n`;
        break;
      case 'phone_support':
        response += `📞 **Phone Support:** 1-800-XXX-XXXX\n`;
        response += `• Monday-Friday, 9AM-6PM EST\n`;
        response += `• Best for urgent issues or immediate assistance\n`;
        break;
      case 'live_chat':
        response += `💬 **Live Chat:** Available on our website\n`;
        response += `• Monday-Friday, 9AM-6PM EST\n`;
        response += `• Best for quick questions and real-time help\n`;
        break;
      case 'help_center':
        response += `📋 **Help Center:** Visit our website's help section\n`;
        response += `• Self-service options and detailed guides\n`;
        response += `• Available 24/7\n`;
        break;
    }

    response += `\nThey'll have access to your account details and can provide personalized assistance.`;

    return {
      content: [
        {
          type: 'text',
          text: response,
        },
      ],
    };
  }

  private async handleRefreshCache(_args: { force_refresh?: boolean }) {
    try {
      console.error('[INFO] Manually refreshing document cache...');

      // Force rebuild the index
      this.searchEngine['isIndexBuilt'] = false;
      await this.searchEngine.buildIndex();

      const docCount = this.searchEngine['documentsIndex'].size;

      return {
        content: [
          {
            type: 'text',
            text: `✅ **Cache Refreshed Successfully**\n\nFetched ${docCount} documents from remote server.\nAll content is now up-to-date with the latest version from https://www.postscanmail.com/tools/markdown/`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ **Cache Refresh Failed**\n\nError: ${getErrorMessage(error)}\n\nPlease try restarting the server if the problem persists.`,
          },
        ],
      };
    }
  }

  // === ENHANCED RESULT FORMATTING ===
  private formatIntelligentSearchResults(
    args: {
      query: string;
      category: string;
      intent_analysis: string;
      confidence_level: string;
    },
    results: SearchResult[]
  ): string {
    if (results.length === 0) {
      return this.formatNoResultsFound(args);
    }

    let output = `**🔍 Search Results for "${args.query}"** (Category: ${args.category})\n\n`;

    // Add confidence indicator
    const confidenceEmoji =
      args.confidence_level === 'high'
        ? '✅'
        : args.confidence_level === 'medium'
          ? '⚠️'
          : '❓';
    output += `${confidenceEmoji} **Intent Confidence:** ${args.confidence_level}\n`;
    output += `**Detected Intent:** ${args.intent_analysis}\n\n`;

    output += `Found ${results.length} relevant document${results.length > 1 ? 's' : ''}:\n\n`;

    // Separate primary results from brief mentions
    const primaryResults = results.filter(r => !r.isBriefMention);
    const briefMentions = results.filter(r => r.isBriefMention);

    // Display primary results with full details
    primaryResults.forEach((result, index) => {
      const relevanceBar = this.createRelevanceBar(result.relevanceScore);

      output += `**${index + 1}. ${result.title}**\n`;
      output += `*Relevance: ${relevanceBar} | Category: ${result.category}*\n\n`;
      output += `${result.snippet}\n\n`;

      if (result.matchedTerms.length > 0) {
        output += `*Matched: ${result.matchedTerms.join(', ')}*\n`;
      }

      output += `*📄 Source: ${result.filename}*\n`;
      output += `---\n\n`;
    });

    // Add brief mentions section if any exist
    if (briefMentions.length > 0) {
      output += `**📋 Additional Related Documents (Brief):**\n\n`;
      briefMentions.forEach(result => {
        output += `• **${result.title}** - ${result.snippet} *(${result.filename})*\n`;
      });
      output += `\n`;
    }

    // Add important disclaimer
    output += `⚠️ **Important:** This information is based on our available documentation. `;
    output += `For account-specific questions or issues not covered here, please contact our support team.\n\n`;

    // Add follow-up suggestions
    output += `💡 **Need more help?**\n`;
    output += `• If this doesn't answer your question, try asking more specifically\n`;
    output += `• For account issues, contact support directly\n`;
    output += `• For technical problems, our support team can provide personalized assistance`;

    return output;
  }

  private formatNoResultsFound(args: {
    query: string;
    category: string;
    intent_analysis: string;
  }): string {
    let output = `**No documentation found for: "${args.query}"**\n\n`;

    output += `I searched our ${args.category} documentation but couldn't find information about this topic.\n\n`;

    output += `**This might mean:**\n`;
    output += `• The topic isn't covered in our current documentation\n`;
    output += `• Different keywords might help find what you need\n`;
    output += `• It requires personalized assistance from our support team\n\n`;

    output += `**What you can do:**\n`;
    output += `• Try rephrasing your question with different keywords\n`;
    output += `• Contact our support team for personalized help:\n`;
    output += `  - Email: support@postscanmail.com\n`;
    output += `  - Phone: 1-800-XXX-XXXX (Mon-Fri 9AM-6PM EST)\n`;
    output += `  - Live chat on our website\n\n`;

    output += `🚫 **I cannot provide information that isn't in our documentation** - this ensures you get accurate, up-to-date details from our support team.`;

    return output;
  }

  private createRelevanceBar(score: number): string {
    const normalizedScore = Math.min(Math.floor(score / 10), 5);
    return '*'.repeat(Math.max(normalizedScore, 1));
  }

  async run() {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('[INFO] PostScan Mail Unified MCP Server running on stdio');
      console.error(
        '[INFO] Fetching documents from: https://www.postscanmail.com/tools/markdown/'
      );
    } catch (error) {
      console.error(
        `[ERROR] Failed to start server: ${getErrorMessage(error)}`
      );
      throw error;
    }
  }
}

// === START SERVER ===
const server = new UnifiedMCPServer();
server.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { UnifiedMCPServer, UnifiedSearchEngine };

// === AGENT PROMPT INSTRUCTIONS ===
/*
INSTRUCTIONS FOR THE LLM AGENT USING THESE TOOLS:

1. **ALWAYS ANALYZE INTENT FIRST**
   - What is the user really asking?
   - Is the question clear and specific?
   - What category does this fall into?

2. **USE CLARIFY_INTENT WHEN NEEDED**
   - If question is vague, unclear, or missing context
   - Better to ask than to guess wrong

3. **SEARCH INTELLIGENTLY**
   - Use specific keywords from user's question
   - Choose appropriate category
   - Include intent analysis in the search

4. **VALIDATE YOUR RESPONSE**
   - Use validate_response tool before answering
   - Only provide information found in search results
   - Never extrapolate or assume

5. **ESCALATE WHEN APPROPRIATE**
   - If no relevant documentation found
   - For account-specific issues
   - For complex technical problems

6. **RESPONSE GUIDELINES**
   - Be helpful but honest about limitations
   - Always cite sources when possible
   - Encourage contacting support for personalized help
   - Never make up information

REMEMBER: It's better to say "I don't know" than to provide incorrect information!
*/
