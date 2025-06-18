# API Reference & Integration Guide

## Base URL
```
http://localhost:3000/api
```

## Authentication
No authentication required. Access is controlled by email addresses instead of tokens.

## Response Format
All API responses follow this structure:
```json
{
  "success": true|false,
  "data": {...},     // Present on success
  "error": "...",    // Present on error
  "message": "..."   // Optional additional info
}
```

---

## 📧 Temporary Email Management

### 1. Generate Temporary Email

**Endpoint:** `POST /temp-email/generate`

**Request Body:**
```json
{
  "customAddress": "myemail@domain.com",  // Optional: custom email address
  "expiryHours": 24                      // Optional: 1-168 hours (default: 24)
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "email": "abc123def@domain.com",
    "expiresAt": "2024-01-15T10:30:00.000Z",
    "createdAt": "2024-01-14T10:30:00.000Z"
  }
}
```

**Response (Error - 400):**
```json
{
  "success": false,
  "error": "Custom address must use domain: domain.com"
}
```

**Response (Error - 409):**
```json
{
  "success": false,
  "error": "Email address already exists"
}
```

---

## 📨 Email Operations

### 2. Get Emails for Temporary Address

**Endpoint:** `GET /temp-email/{email}/emails`

**Parameters:**
- `email` (path): URL-encoded email address (e.g., `test%40domain.com`)
- `limit` (query): Number of emails to return (1-100, default: 50)
- `offset` (query): Number of emails to skip (default: 0)
- `onlyUnread` (query): Filter only unread emails (`true`/`false`, default: `false`)
- `fields` (query): Comma-separated list of fields to return (optional)

**Available Fields:**
`id`, `from`, `fromName`, `subject`, `receivedAt`, `isRead`, `hasAttachments`, `size`, `preview`, `bodyText`, `bodyHtml`, `attachments`, `headers`

**Example Requests:**
```bash
# Basic request
GET /temp-email/test%40domain.com/emails

# With pagination
GET /temp-email/test%40domain.com/emails?limit=20&offset=40

# Only unread emails
GET /temp-email/test%40domain.com/emails?onlyUnread=true

# Specific fields only (performance optimization)
GET /temp-email/test%40domain.com/emails?fields=id,from,subject,receivedAt

# Preview mode
GET /temp-email/test%40domain.com/emails?fields=id,from,subject,preview,isRead
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "emails": [
      {
        "id": 5,
        "from": "sender@example.com",
        "fromName": "John Doe",
        "subject": "Welcome to our service",
        "receivedAt": "2024-01-14T15:30:00.000Z",
        "isRead": false,
        "hasAttachments": true,
        "size": 3885,
        "preview": "Thank you for signing up...",
        "bodyText": "Thank you for signing up for our service...",
        "bodyHtml": "<html><body>Thank you for signing up...</body></html>",
        "attachments": [
          {
            "filename": "welcome.pdf",
            "contentType": "application/pdf",
            "size": 12458,
            "hasContent": true
          }
        ],
        "headers": {
          "message-id": "<123@example.com>",
          "date": "2024-01-14T15:30:00.000Z"
        }
      }
    ],
    "pagination": {
      "total": 15,
      "unread": 8,
      "limit": 50,
      "offset": 0,
      "hasMore": false
    },
    "tempEmail": {
      "email": "test@domain.com",
      "expiresAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Response (Error - 404):**
```json
{
  "success": false,
  "error": "Temporary email not found"
}
```

**Response (Error - 410):**
```json
{
  "success": false,
  "error": "Temporary email has expired"
}
```

---

### 3. Get Specific Email

**Endpoint:** `GET /temp-email/{email}/emails/{emailId}`

**Parameters:**
- `email` (path): URL-encoded email address
- `emailId` (path): Email ID

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "email": {
      "id": 5,
      "from": "sender@example.com",
      "fromName": "John Doe",
      "to": "test@domain.com",
      "subject": "Welcome to our service",
      "receivedAt": "2024-01-14T15:30:00.000Z",
      "isRead": true,
      "bodyText": "Full email content...",
      "bodyHtml": "<html><body>Full email content...</body></html>",
      "attachments": [],
      "headers": {},
      "size": 3885
    },
    "tempEmail": {
      "email": "test@domain.com",
      "expiresAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Response (Error - 404):**
```json
{
  "success": false,
  "error": "Email not found"
}
```

---

### 4. Search Emails

**Endpoint:** `POST /temp-email/{email}/search`

**Request Body:**
```json
{
  "query": "invoice",         // Search term (required)
  "limit": 20,               // Optional: 1-50 (default: 20)
  "offset": 0,               // Optional: default 0
  "fields": "id,from,subject" // Optional: specific fields
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "emails": [
      {
        "id": 3,
        "from": "billing@company.com",
        "subject": "Invoice #12345",
        "preview": "Your invoice for this month..."
      }
    ],
    "searchQuery": "invoice",
    "count": 1
  }
}
```

---

## 🗑️ Email Deletion

### 5. Delete Specific Email

**Endpoint:** `DELETE /temp-email/{email}/emails/{emailId}`

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Email deleted successfully"
}
```

### 6. Delete All Emails

**Endpoint:** `DELETE /temp-email/{email}/emails`

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "5 emails deleted successfully"
}
```

---

## ⚙️ Email Management

### 7. Extend Email Expiry

**Endpoint:** `PUT /temp-email/{email}/extend`

**Request Body:**
```json
{
  "hours": 48  // 1-168 hours
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "email": "test@domain.com",
    "expiresAt": "2024-01-16T10:30:00.000Z",
    "message": "Email extended by 48 hours"
  }
}
```

**Response (Error - 400):**
```json
{
  "success": false,
  "error": "Hours must be between 1 and 168 (7 days)"
}
```

### 8. Get Email Statistics

**Endpoint:** `GET /temp-email/{email}/stats`

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "email": "test@domain.com",
    "createdAt": "2024-01-14T10:30:00.000Z",
    "expiresAt": "2024-01-15T10:30:00.000Z",
    "totalEmails": 15,
    "unreadEmails": 8,
    "readEmails": 7
  }
}
```

---

## 🔧 System Endpoints

### 9. Health Check

**Endpoint:** `GET /health`

**Response (Success - 200):**
```json
{
  "status": "OK",
  "timestamp": "2024-01-14T15:30:00.000Z",
  "uptime": 86400,
  "environment": "development",
  "version": "1.0.0",
  "smtpPort": 25,
  "emailDomain": "domain.com"
}
```

### 10. Admin Statistics

**Endpoint:** `GET /admin/stats`

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "tempEmails": {
      "activeEmails": 45,
      "expiredEmails": 12,
      "totalEmails": 150
    },
    "emails": {
      "total": 150,
      "unread": 23,
      "today": 8
    },
    "scheduler": {
      "isRunning": true,
      "jobs": {
        "cleanup": {
          "running": true,
          "lastDate": "2024-01-14T14:00:00.000Z",
          "nextDate": "2024-01-14T15:00:00.000Z"
        }
      }
    },
    "server": {
      "uptime": 86400,
      "memoryUsage": {
        "rss": 50331648,
        "heapTotal": 20971520,
        "heapUsed": 18874368
      },
      "nodeVersion": "v18.17.0",
      "smtpPort": 25,
      "emailDomain": "domain.com"
    }
  }
}
```

### 11. Manual Cleanup

**Endpoint:** `POST /admin/cleanup`

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Cleanup completed successfully",
  "data": {
    "deletedEmails": 0,
    "deletedTempEmails": 5
  }
}
```

### 12. SMTP Server Info

**Endpoint:** `GET /smtp/info`

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "smtpPort": 25,
    "smtpHost": "0.0.0.0",
    "emailDomain": "domain.com",
    "isDirectSMTP": true,
    "postfixRequired": false,
    "instructions": {
      "dns": "Set MX record: domain.com -> your-server-ip",
      "firewall": "Open port 25 for incoming emails",
      "testing": "Send email to: anything@domain.com"
    }
  }
}
```

---

## 🚀 Performance Optimization

### Field Selection
Use the `fields` parameter to request only needed properties and reduce response size by up to 95%:

```bash
# Minimal email list (95% smaller)
GET /emails?fields=id,from,subject,receivedAt

# Preview mode (80% smaller)
GET /emails?fields=id,from,subject,preview,isRead

# Full content when needed
GET /emails?fields=bodyText,bodyHtml,attachments,headers
```

### Pagination
Use `limit` and `offset` for large email lists:

```bash
# First page
GET /emails?limit=20&offset=0

# Second page
GET /emails?limit=20&offset=20
```

---

## 🔗 URL Encoding

Email addresses must be URL-encoded in path parameters:

| Character | Encoded |
|-----------|---------|
| `@`       | `%40`   |
| `+`       | `%2B`   |
| Space     | `%20`   |

**Examples:**
- `test@domain.com` → `test%40domain.com`
- `user+tag@domain.com` → `user%2Btag%40domain.com`

---

## 📱 Integration Examples

### JavaScript/Fetch
```javascript
// Generate temporary email
const response = await fetch('/api/temp-email/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ expiryHours: 24 })
});
const { email } = (await response.json()).data;

// Get emails with minimal fields
const emailsResponse = await fetch(
  `/api/temp-email/${encodeURIComponent(email)}/emails?fields=id,from,subject,receivedAt`
);
const emails = (await emailsResponse.json()).data.emails;

// Get full email content
const emailContent = await fetch(
  `/api/temp-email/${encodeURIComponent(email)}/emails/5?fields=bodyText,bodyHtml`
);
```

### Python/Requests
```python
import requests
import urllib.parse

# Generate email
response = requests.post('http://localhost:3000/api/temp-email/generate', 
                        json={'expiryHours': 24})
email = response.json()['data']['email']

# Get emails
encoded_email = urllib.parse.quote(email)
emails_response = requests.get(f'http://localhost:3000/api/temp-email/{encoded_email}/emails')
emails = emails_response.json()['data']['emails']

# Search emails
search_response = requests.post(f'http://localhost:3000/api/temp-email/{encoded_email}/search',
                               json={'query': 'invoice', 'fields': 'id,from,subject'})
```

### cURL
```bash
# Generate email
curl -X POST http://localhost:3000/api/temp-email/generate \
  -H "Content-Type: application/json" \
  -d '{"expiryHours": 24}'

# Get emails with field selection
curl "http://localhost:3000/api/temp-email/test%40domain.com/emails?fields=id,from,subject"

# Search emails
curl -X POST http://localhost:3000/api/temp-email/test%40domain.com/search \
  -H "Content-Type: application/json" \
  -d '{"query": "invoice", "fields": "id,from,subject"}'
```

---

## ⚠️ Error Codes

| Code | Description |
|------|-------------|
| 200  | Success |
| 400  | Bad Request (validation error) |
| 404  | Resource not found |
| 409  | Conflict (email already exists) |
| 410  | Gone (email expired) |
| 429  | Too Many Requests (rate limited) |
| 500  | Internal Server Error |

---

## 📊 Rate Limiting

- **Window**: 15 minutes (900,000ms)
- **Max Requests**: 100 per window
- **Headers**: Rate limit info included in response headers

---

## 🎯 Best Practices

1. **Use Field Selection**: Always specify `fields` parameter for better performance
2. **URL Encoding**: Always encode email addresses in URLs
3. **Pagination**: Use `limit` and `offset` for large datasets
4. **Error Handling**: Check `success` field in all responses
5. **Caching**: Cache temporary email addresses to avoid repeated generation
6. **Cleanup**: Delete emails when no longer needed to save storage

---

## 🔄 Email Lifecycle

1. **Generate** temporary email address (expires automatically)
2. **Receive** emails at that address (emails never expire automatically)
3. **Read** emails via API
4. **Delete** emails manually when done
5. **Extend** temporary email address if needed

**Note**: Emails do not expire automatically - only temporary email addresses expire. Emails persist until manually deleted. 