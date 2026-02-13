# 🎯 KBYG AI - Chrome Extension

**Know Before You Go** - AI-powered conference networking assistant

Transform conference networking from chaos to clarity with AI-powered event analysis, persistent enrichment, and automated outreach.

---

## 🚀 Quick Start

### Installation

1. **Download the extension:**
   ```bash
   # Download the latest build
   curl -L https://github.com/ammonfife/kbyg/raw/main/kbyg.zip -o kbyg.zip
   unzip kbyg.zip
   ```
   
   Or download directly: [kbyg.zip](https://github.com/ammonfife/kbyg/raw/main/kbyg.zip)

2. **Load into Chrome:**
   - Open Chrome and navigate to `chrome://extensions`
   - Enable **Developer mode** (toggle in top right)
   - Click **Load unpacked**
   - Select the `chrome-extension/` folder from the unzipped directory

3. **Configure your API key:**
   - Click the KBYG extension icon in your toolbar
   - Go to Settings
   - Add your **Gemini API key** ([Get one free here](https://aistudio.google.com/app/apikey))
   - Fill in your company details (used for personalization)
   - Click Save

4. **You're ready!**
   - Visit any conference or event website
   - Click the KBYG icon
   - Click **Analyze Event**
   - View results in the sidepanel

---

##  Features

### AI-Powered Event Analysis
- **People extraction** - Names, titles, companies from conference pages
- **Ice breaker generation** - AI-generated conversation starters
- **Target personas** - Who to prioritize based on your profile
- **Company insights** - Industry, size, tech stack detection

### Data Management
- **Persistent storage** - Last 50 analyses saved locally
- **Auto-save to database** - Companies automatically saved to Turso
- **CSV export** - Import attendees directly into your CRM
- **MCP integration** - Access data from any MCP-compatible client.

### Personalization
- **Your company context** - Tailor analysis to your business
- **Custom ice breakers** - Based on your industry and role
- **Relevance scoring** - Prioritize most valuable connections

---

## 🎯 Use Cases

### Pre-Conference Research
1. Visit conference attendee page
2. Click KBYG -> Analyze Event
3. Review extracted companies and people
4. Export CSV to CRM
5. Prepare conversation starters

**Result:** Show up knowing who to talk to and what to say.

### Post-Conference Follow-Up
1. Companies auto-saved during event
2. Open your MCP client
3. Ask: "Show me companies from XYZ conference"
4. Ask: "Enrich Company ABC and draft follow-up email"
5. Send personalized emails

**Result:** Personalized outreach in minutes, not hours.

---

## 🔧 How It Works

```
Conference Website
    
Chrome Extension (AI Analysis)
    
Extract: People + Companies + Sponsors
    
Generate: Ice Breakers + Personas
    
Save Locally + Auto-save to Turso
    
Access via MCP Clients
    
AI Enrichment + Strategy Generation
    
Personalized Outreach Emails
```

---

## 🛠 Tech Stack

- **Framework:** Manifest V3 Chrome Extension
- **AI:** Google Gemini 1.5 Pro
- **Storage:** `chrome.storage.local` (local) + Turso (cloud)
- **UI:** HTML/CSS sidepanel
- **Integration:** HTTP client for MCP server

---

## 📊 What Gets Analyzed

The extension analyzes conference pages and extracts:

### People
- Full names
- Job titles
- Companies
- LinkedIn profiles (when available)

### Companies
- Company names
- Industries
- Size/stage (startup, enterprise, etc.)
- Technologies mentioned

### Context
- Event type (conference, meetup, etc.)
- Topics and themes
- Sponsors and partners
- Venue and dates

### AI-Generated Content
- Conversation starters tailored to each person
- Target persona recommendations
- Relevance scores
- Industry insights

---

## 🔐 Privacy & Security

### What We Store Locally
- Your Gemini API key (browser storage only)
- Your company profile
- Last 50 event analyses
- User preferences

### What We Send to the Cloud
- Company profiles (name, industry, context)
- Employee names and titles (no personal data)
- Event context (for enrichment)

### What We Don't Collect
- Your browsing history
- Personal contact information
- API keys (stored locally only)
- Analytics or tracking data

### Your Data Rights
- All local data can be cleared via Settings
- Cloud data accessible only to you (via MCP)
- Delete companies anytime via MCP tools

---

## 🤝 Integration with MCP

KBYG auto-saves companies to the MCP server for persistent access.

### Access Your Data

**Via any MCP client:**
```
"Show me all companies from the Utah Healthcare AI conference"
"Enrich NextTherapist and generate an outreach strategy"
"Draft a personalized email to their CEO"
```

### MCP Tools Available
- `gtm_list_companies` - View all saved companies
- `gtm_search_companies` - Fuzzy search by name/industry
- `gtm_enrich_company` - AI-powered enrichment (Gemini)
- `gtm_generate_strategy` - Personalized GTM strategies
- `gtm_draft_email` - Outreach email generation

See [MCP Server Documentation](../unified-mcp-server/README.md) for details.

---

## 📝 Example Workflow

### Scenario: Utah Healthcare AI Conference

1. **Pre-Conference (Day Before)**
   - Visit conference website
   - Click KBYG -> Analyze Event
   - Review 50 attendees from 20 companies
   - Export CSV -> Import to Salesforce
   - Review ice breakers: "Ask about their HIPAA compliance journey"

2. **During Conference (Day Of)**
   - Meet CEO of NextTherapist
   - Discuss AI in mental health
   - Mention personalized ice breaker
   - Exchange contact info

3. **Post-Conference (Next Day)**
   - Open your MCP client
   - "Show me NextTherapist from my saved companies"
   - "Enrich with latest news and tech stack"
   - "Draft a follow-up email mentioning HIPAA and our chat"
   - Copy email -> Send from Gmail

4. **Result:**
   - Meaningful conversation at event (prepared)
   - Personalized follow-up within 24 hours
   - Higher conversion rate vs. generic outreach

---

##  Configuration

### API Key Setup

1. Get a free Gemini API key: https://aistudio.google.com/app/apikey
2. Click KBYG icon -> Settings
3. Paste API key
4. Save

**Note:** Your API key is stored locally in your browser only. Never sent to our servers.

### Company Profile

Fill in your details for better personalization:

- **Company Name** - Your company
- **Industry** - Your sector (SaaS, Healthcare, etc.)
- **Role** - Your job title
- **Target Market** - Who you sell to
- **Value Proposition** - What makes you unique

These details tailor ice breakers and relevance scoring.

---

## 🐛 Troubleshooting

### Extension Not Loading
- Make sure Developer mode is enabled in `chrome://extensions`
- Check that you selected the `chrome-extension/` folder (not the parent)
- Try reloading the extension

### Analysis Not Working
- Verify your Gemini API key is valid
- Check browser console for errors (F12 -> Console)
- Make sure you're on a page with attendee/speaker listings
- Some conference pages may not have structured data

### Data Not Saving to MCP
- Check that MCP server is running (see [setup docs](../unified-mcp-server/README.md))
- Verify Turso credentials in MCP server config
- Check browser console for HTTP errors

### CSV Export Empty
- Make sure analysis completed successfully
- Check that people/companies were extracted
- Some pages may not have exportable data

---

## 📚 Additional Documentation

- **[Main Project README](../README.md)** - Full project overview
- **[MCP Server Setup](../unified-mcp-server/README.md)** - Backend configuration
- **[MCP Integration Guide](./README-MCP-INTEGRATION.md)** - Extension  MCP details
- **[Workflow Documentation](../WORKFLOW.md)** - Complete data flow

---

## 🛣 Roadmap

### Current (v1.0)
-  AI-powered event analysis
-  People and company extraction
-  Ice breaker generation
-  CSV export
-  Auto-save to MCP

### Coming Soon (v1.1)
- [ ] View saved companies in sidepanel
- [ ] Batch operations (enrich all from event)
- [ ] Sync status indicator
- [ ] LinkedIn message composer
- [ ] Analysis history browser

### Future (v2.0)
- [ ] LinkedIn integration (auto-send messages)
- [ ] Calendar integration (auto-add events)
- [ ] CRM sync (Salesforce, HubSpot)
- [ ] Email client integration
- [ ] Mobile app

---

## 📄 License

MIT License - see [LICENSE](../LICENSE) for details

---

## 🙏 Credits

**Built by:**
- Alton Alexander
- Ben Fife
- Parker Boyak

**Powered by:**
- [Google Gemini](https://ai.google.dev/) - AI analysis
- [Turso](https://turso.tech/) - Cloud database
- [MCP](https://modelcontextprotocol.io/) - Integration layer

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/altonalexander/kbyg-ai/issues)
- **Email:** ben@genomicdigital.com

---

**Built with  for GTM teams who are tired of generic networking.**
