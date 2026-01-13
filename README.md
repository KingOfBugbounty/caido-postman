# Caido Postman Integration

**Author: @OFJAAAH**

A powerful Caido plugin that integrates with Postman to search public collections, import API requests, replay them through Caido, and export authenticated requests from your HTTP history.

## Features

### Postman Integration
- **Search Postman Public Network** - Search through thousands of public API collections with unlimited pagination (up to 50,000 results)
- **Import Collections** - Fetch complete Postman collections with all requests, headers, body, query parameters, and authentication
- **Fetch Your Collections** - Access your private Postman workspaces and collections using your API key
- **API Usage Monitoring** - Track your Postman API usage limits

### Request Management
- **Replay Requests** - Replay any request from Caido's HTTP history through the proxy
- **Import & Send** - Import requests from Postman and send them directly through Caido
- **Auto-Replay** - Test imported API endpoints automatically
- **Full Request Details** - Extract complete headers, body, query parameters, and authentication data

### History Filtering
- **Filter by Domain** - Search Caido history by target domain
- **Filter by Status Code** - Filter requests by HTTP status (200, 201, 400, etc.)
- **Filter by Method** - Filter by HTTP method (GET, POST, PUT, DELETE, etc.)
- **Authentication Detection** - Automatically detect authenticated requests

### Authentication Detection
The plugin automatically detects and classifies authentication types:
- **Bearer Token** - `Authorization: Bearer xxx`
- **Basic Auth** - `Authorization: Basic xxx`
- **Digest Auth** - `Authorization: Digest xxx`
- **API Key** - Headers like `X-Api-Key`, `Api-Key`, `X-Auth-Token`, `X-Access-Token`
- **Cookie/Session** - Cookies containing `session`, `token`, `auth`, `jwt`, `sid`
- **CSRF Token** - `X-CSRF-Token`, `X-XSRF-Token` headers

## Installation

### From Release (Recommended)
1. Download `caido-postman-v1.0.0.zip` from Releases
2. In Caido, go to **Settings > Plugins**
3. Click **Install from file**
4. Select the downloaded ZIP file

### From Source
```bash
# Clone the repository
git clone https://github.com/OFJAAAH/caido-postman.git
cd caido-postman

# Install dependencies
npm install

# Build the plugin
npm run build
```

## Configuration

### Postman API Key (Required for private collections)
1. Go to [Postman API Keys](https://go.postman.co/settings/me/api-keys)
2. Create a new API Key with read permissions
3. In the plugin, paste the API Key in the configuration field
4. Click "Test Connection" to verify

## Usage

### Searching Public Collections
1. Open the plugin in Caido sidebar
2. Enter a search term (e.g., "twitter api", "stripe", "aws")
3. Click "Search" to find public collections
4. Select a collection to view its requests
5. Click on any request to import and send it

### Importing from Your Collections
1. Configure your Postman API Key
2. Click "My Collections" to list your private collections
3. Select a collection to import
4. View all requests with full details (headers, body, auth)
5. Click "Send" to replay any request through Caido

### Filtering Caido History
1. Enter a domain to filter (e.g., `api.target.com`)
2. Select status code filter (optional)
3. Select HTTP method filter (optional)
4. Click "Search Requests"
5. View requests with authentication details highlighted
6. Click "Replay" to resend any request

### Request Details Extracted
For each imported request, you get:
- Full URL with query parameters
- All HTTP headers
- Request body (raw, form-data, urlencoded, GraphQL)
- Authentication configuration
- Request description/documentation

## API Reference

### Backend Functions

```typescript
// Filter Caido history by domain
filterHistory(domain: string, statusCode?: string, method?: string): FilteredRequest[]

// Replay a request from history
replayRequest(requestId: string): ReplayResult

// Import and send a Postman request
importAndSendRequest(method: string, url: string, headers: string, body: string): ImportResult

// Search Postman public network (unlimited pagination)
searchPostmanPublicNetwork(query: string): PostmanSearchResult[]

// Fetch a collection by ID
fetchPostmanCollection(collectionId: string, apiKey: string): PostmanCollectionData

// Get user's private collections
fetchMyCollections(apiKey: string): Collection[]

// Get user's workspaces
fetchMyWorkspaces(apiKey: string): Workspace[]

// Check API usage limits
getPostmanApiUsage(apiKey: string): { limit: number; usage: number }
```

## Project Structure

```
caido-postman/
├── caido.config.ts        # Plugin configuration
├── package.json           # Dependencies
├── src/
│   ├── backend/
│   │   └── src/
│   │       └── index.ts   # Backend API handlers
│   └── frontend/
│       └── src/
│           ├── index.ts   # Frontend UI
│           └── styles.css # Styling
├── dist/                  # Built plugin
└── README.md
```

## Use Cases

### Bug Bounty Hunting
- Search for public API collections of your target
- Import authenticated requests from Postman
- Replay with modified parameters through Caido
- Test API endpoints for vulnerabilities

### API Security Testing
- Quickly import API documentation from Postman
- Send requests through Caido's intercepting proxy
- Analyze responses and authentication flows
- Export interesting requests for further testing

### Reconnaissance
- Find leaked or public API collections
- Discover undocumented endpoints
- Extract authentication patterns
- Map API attack surface

## License

MIT License - @OFJAAAH

## Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## Disclaimer

This tool is intended for authorized security testing only. Always obtain proper authorization before testing APIs. The author is not responsible for misuse of this tool.
