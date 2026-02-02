# MCP Server Integration

The Chrome extension now integrates with the GTM MCP Server for persistent storage and AI-powered enrichment.

## How It Works

### Auto-Save Flow

1. **User analyzes an event page** → Chrome extension extracts companies and people
2. **Results are shown** → Displayed in the sidepanel
3. **Auto-save triggers** → Companies are automatically saved to Turso database via MCP server
4. **Local backup** → Analysis is also saved to `chrome.storage.local` for offline access

### Data Extraction

The integration extracts companies from two sources:

**From People:**
- Company name from each person's profile
- Creates employee records with name, title, LinkedIn

**From Sponsors:**
- Sponsor companies
- Adds sponsor tier as description

### What Gets Saved

For each company:
```javascript
{
  name: "Company Name",
  employees: [
    { name: "John Doe", title: "CEO", linkedin: "..." }
  ],
  description: "Extracted details",
  industry: "From user profile or Unknown",
  context: "Event name and date extracted"
}
```

## MCP Server Setup

### 1. Start Unified MCP Server

```bash
cd /Users/benfife/clawd/gtm-hackathon/unified-mcp-server
npm install
npm run build
npm run start:http
```

Server runs at `http://localhost:3000`

### 2. Update MCP Server URL (if deployed)

Edit `chrome-extension/mcp-integration.js`:
```javascript
const MCP_SERVER_URL = 'https://your-production-url.com';
```

### 3. Enable CORS (Production)

If deploying MCP server remotely, ensure CORS is enabled for Chrome extension:

```javascript
// In unified-mcp-server/src/http-server.ts
app.use(cors({
  origin: 'chrome-extension://*',
  credentials: true
}));
```

## Features

### Auto-Save
- Automatically saves companies after each analysis
- No user action required
- Shows toast notification on success

### Error Handling
- Gracefully degrades if MCP server unavailable
- Falls back to local storage only
- Logs warnings but doesn't interrupt user flow

### Local Backup
- All analyses saved to `chrome.storage.local`
- Keeps last 50 analyses
- Available offline

## Available MCP Tools

The extension can call these MCP server tools:

| Tool | Purpose |
|------|---------|
| `gtm_add_company` | Save company to database |
| `gtm_get_company` | Retrieve company details |
| `gtm_list_companies` | List all companies |
| `gtm_search_companies` | Search by name/industry/employee |
| `gtm_enrich_company` | AI-enrich with Gemini |
| `gtm_generate_strategy` | Generate GTM strategy |
| `gtm_draft_email` | Draft outreach email |

## Future Enhancements

### Planned Features

1. **View Saved Companies**
   - New tab in sidepanel to browse saved companies
   - Search and filter capabilities
   - Direct enrichment from UI

2. **Enrichment Workflow**
   - Batch enrich all companies from an event
   - Generate strategies for target personas
   - Draft emails in bulk

3. **Sync Indicator**
   - Show sync status in UI
   - Retry failed saves
   - Export to other platforms

4. **Analysis History**
   - View past analyses
   - Re-analyze updated event pages
   - Track changes over time

## Testing

### Check MCP Server Health

Open browser console in sidepanel:
```javascript
checkMCPServerHealth().then(console.log)
// Returns: { available: true, server: {...} }
```

### View Saved Companies

```javascript
listSavedCompanies().then(console.log)
// Returns: List of all companies in database
```

### Search Companies

```javascript
searchCompanies('healthcare').then(console.log)
// Returns: Companies matching "healthcare"
```

## Troubleshooting

### Companies Not Saving

1. **Check MCP server is running:**
   ```bash
   curl http://localhost:3000/health
   ```

2. **Check browser console** for errors

3. **Verify Turso credentials** in `.env`:
   ```bash
   cd unified-mcp-server
   cat .env | grep TURSO
   ```

### CORS Errors

If you see CORS errors in console:

1. **Use HTTP mode** (not stdio) for MCP server
2. **Enable CORS** in http-server.ts
3. **Test from localhost** first before deploying

### Network Errors

- MCP server must be accessible from browser
- Check firewall/network settings
- Use `ngrok` or similar for remote testing

## Architecture

```
┌─────────────────────────────┐
│   Chrome Extension          │
│   (Event Analysis)          │
└──────────┬──────────────────┘
           │
           │ HTTP POST /tools/call
           ▼
┌─────────────────────────────┐
│   Unified MCP Server        │
│   (http://localhost:3000)   │
│                             │
│   ┌─────────────────────┐  │
│   │ Tool Router         │  │
│   │ - gtm_add_company   │  │
│   │ - gtm_enrich_...    │  │
│   └─────────────────────┘  │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│   Turso Database            │
│   (SQLite Cloud)            │
│                             │
│   Tables:                   │
│   - companies               │
│   - employees               │
└─────────────────────────────┘
```

## Example Flow

1. User visits conference page
2. Clicks "Analyze Event"
3. Extension extracts 15 people from 8 companies
4. Results displayed in sidepanel
5. **Background:** `autoSaveAnalysis()` runs
6. MCP server receives 8 `gtm_add_company` calls
7. Companies saved to Turso database
8. Toast shows "💾 Saved 8 companies to database"
9. User can now access companies from any MCP client (Claude Desktop, Moltbot, etc.)

## Security

- **API keys never sent** to MCP server (server has its own Gemini key)
- **User data stored** in Turso (encrypted at rest)
- **HTTPS required** for production deployments
- **Local storage** as fallback (stored in browser only)

---

**Status:** ✅ Integrated and ready for testing  
**Dependencies:** Unified MCP Server must be running  
**Location:** `/chrome-extension/mcp-integration.js`
