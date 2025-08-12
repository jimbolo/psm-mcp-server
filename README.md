# Postscan Mail MCP Server

A Model Context Protocol (MCP) server for postscan mail functionality.

## What is this?

This is a server that extends Claude Desktop with additional mail scanning capabilities. It allows Claude to interact with mail systems through the Model Context Protocol (MCP).

## Prerequisites

Before you start, make sure you have:

- **Node.js** (version 16 or higher) installed on your computer ([Download here](https://nodejs.org/))
- **Claude Desktop** application installed
- Basic familiarity with using a terminal/command prompt

**✅ Platform Support:** This server works on Windows, Mac, and Linux as it uses standard Node.js APIs.

## Quick Setup

### Step 1: Download

1. Click the green "Code" button → "Download ZIP"
2. Extract to your Desktop or Downloads folder

### Step 2: Find the file path

- The file you need is inside: `dist/postscan-mail-mcp-server.js`
- Note the full path (e.g., `C:\Users\YourName\Downloads\postscan-mail-mcp-server\dist\postscan-mail-mcp-server.js`)

### Step 3: Add to Claude Desktop

1. **Find Claude's config file:**
   - **Windows**: Press `Win+R`, type `%APPDATA%\Claude` and press Enter
   - **Mac**: Go to `~/Library/Application Support/Claude/`
   - **Linux**: Go to `~/.config/Claude/`

2. **Create/edit `claude_desktop_config.json`:**

   ```json
   {
     "mcpServers": {
       "PostScan Mail Search": {
         "command": "node",
         "args": [
           "PASTE_YOUR_FULL_PATH_HERE"
         ],
         "env": {
           "NODE_ENV": "production"
         }
       }
     }
   }
   ```

   **Example paths:**
   - Windows: `"C:\\Users\\YourName\\Downloads\\postscan-mail-mcp-server\\dist\\postscan-mail-mcp-server.js"`
   - Mac: `"/Users/yourusername/Downloads/postscan-mail-mcp-server/dist/postscan-mail-mcp-server.js"`
   - Linux: `"/home/yourusername/Downloads/postscan-mail-mcp-server/dist/postscan-mail-mcp-server.js"`

3. **Replace `PASTE_YOUR_FULL_PATH_HERE`** with the actual path from Step 2

### Step 4: Restart Claude Desktop

Close Claude completely and reopen it.

## Troubleshooting

**Can't find the config file?**

- Windows: Press `Win+R`, type `%APPDATA%\Claude`, press Enter
- If folder doesn't exist, create it first

**"node is not recognized"?**

- Install Node.js from [nodejs.org](https://nodejs.org/)

**Still not working?**

- Make sure the file path is exactly right (copy-paste it)
- Restart Claude Desktop completely

## Need Help?

If you're stuck, create an issue on this GitHub repository with:

- Your operating system
- The exact error message you're seeing
- The path where you saved the files

## License

This project is licensed under the MIT License.
