# API Migration Guide: Token-based to Email-based System

## Overview

This migration removes the token-based authentication system and replaces it with direct email address routing. Additionally, it fixes the bug where email body and subject data were not being returned in API responses.

## Key Changes

### 1. ✅ Token System Removed

**Before:**
```json
{
  "success": true,
  "data": {
    "email": "test123@domain.com",
    "token": "abc123-def456-ghi789",
    "expiresAt": "2024-01-15T10:30:00Z",
    "createdAt": "2024-01-14T10:30:00Z"
  }
}
```

**After:**
```json
{
  "success": true,
  "data": {
    "email": "test123@domain.com",
    "expiresAt": "2024-01-15T10:30:00Z",
    "createdAt": "2024-01-14T10:30:00Z"
  }
}
```

### 2. ✅ API Endpoints Updated

**Before (Token-based):**
```
GET    /api/temp-email/{TOKEN}/emails
GET    /api/temp-email/{TOKEN}/emails/{emailId}
DELETE /api/temp-email/{TOKEN}/emails/{emailId}
DELETE /api/temp-email/{TOKEN}/emails
POST   /api/temp-email/{TOKEN}/search
PUT    /api/temp-email/{TOKEN}/extend
GET    /api/temp-email/{TOKEN}/stats
```

**After (Email-based):**
```
GET    /api/temp-email/{EMAIL}/emails
GET    /api/temp-email/{EMAIL}/emails/{emailId}
DELETE /api/temp-email/{EMAIL}/emails/{emailId}
DELETE /api/temp-email/{EMAIL}/emails
POST   /api/temp-email/{EMAIL}/search
PUT    /api/temp-email/{EMAIL}/extend
GET    /api/temp-email/{EMAIL}/stats
```

### 3. ✅ Complete Email Data Returned

**Before (Limited Preview):**
```json
{
  "id": 4,
  "from": "sender@example.com",
  "fromName": null,
  "subject": "(No Subject)",
  "receivedAt": "2025-06-18T13:53:41.162Z",
  "isRead": false,
  "hasAttachments": false,
  "size": 11273,
  "preview": "DKIM-Signature: v=1; a=rsa-sha256..."
}
```

**After (Complete Data):**
```json
{
  "id": 4,
  "from": "sender@example.com",
  "fromName": null,
  "subject": "Complete Subject Line",
  "receivedAt": "2025-06-18T13:53:41.162Z",
  "isRead": false,
  "hasAttachments": false,
  "size": 11273,
  "preview": "Email preview text...",
  "bodyText": "Full plain text email body content here...",
  "bodyHtml": "<html><body>Full HTML email body here...</body></html>",
  "attachments": [],
  "headers": {
    "dkim-signature": "v=1; a=rsa-sha256...",
    "received": "from mail.example.com...",
    "message-id": "<message123@example.com>"
  }
}
```

## Usage Examples

### Generate Temporary Email
```bash
curl -X POST http://localhost:3000/api/temp-email/generate \
  -H "Content-Type: application/json" \
  -d '{"expiryHours": 24}'
```

### Get Emails (using email address)
```bash
# URL encode the email address: @ becomes %40
curl http://localhost:3000/api/temp-email/test123%40domain.com/emails
```

### Get Specific Email
```bash
curl http://localhost:3000/api/temp-email/test123%40domain.com/emails/4
```

### Search Emails
```bash
curl -X POST http://localhost:3000/api/temp-email/test123%40domain.com/search \
  -H "Content-Type: application/json" \
  -d '{"query": "order confirmation", "limit": 10}'
```

### Extend Email Expiry
```bash
curl -X PUT http://localhost:3000/api/temp-email/test123%40domain.com/extend \
  -H "Content-Type: application/json" \
  -d '{"hours": 48}'
```

### Get Statistics
```bash
curl http://localhost:3000/api/temp-email/test123%40domain.com/stats
```

## URL Encoding

Email addresses in URLs must be properly encoded:
- `@` becomes `%40`
- `+` becomes `%2B`
- Space becomes `%20`

Example: `user+tag@domain.com` → `user%2Btag%40domain.com`

Most HTTP clients handle this automatically:
```javascript
// JavaScript
const email = "test@domain.com";
const url = `/api/temp-email/${encodeURIComponent(email)}/emails`;

// Python
import urllib.parse
email = "test@domain.com"
url = f"/api/temp-email/{urllib.parse.quote(email)}/emails"
```

## Migration Steps for Existing Applications

1. **Update API calls** to use email addresses instead of tokens
2. **Remove token storage** from your client applications
3. **Update URL construction** to properly encode email addresses
4. **Update response parsing** to handle the new complete email data structure
5. **Test thoroughly** with various email formats and special characters

## Testing

Run the test script to verify the changes:
```bash
npm install  # Install axios dependency
node test_api.js
```

## Backward Compatibility

The token-based methods are kept for a short transition period but are deprecated. Update your applications as soon as possible as these will be removed in a future version.

## Benefits

1. **Simplified API** - No need to store and manage tokens
2. **Better UX** - Users can bookmark URLs with their email address
3. **Complete Data** - Full email content including body and headers
4. **Direct Access** - Immediate access using just the email address
5. **Reduced Complexity** - Fewer API calls needed to get complete email data 