# n8n → CRM HMAC Recipe

This shows how to send authenticated events from n8n to the CRM `/webhook` endpoint with replay protection.

Requirements

- WEBHOOK_SECRET from your CRM environment
- n8n 1.x

Headers required

- `x-id`: unique event ID (UUID)
- `x-timestamp`: milliseconds since epoch
- `x-signature`: HMAC-SHA256 over the exact string `"<x-id>.<x-timestamp>.<raw-json-body>"` using `WEBHOOK_SECRET`

Steps in n8n

1. Set node
   - Generate `id` (UUID), `timestamp` (Date.now()), and your payload fields (e.g., lead data).

2. Function node (compose raw JSON string)

   ```js
   const payload = {
     name: $json.name,
     email: $json.email,
     source: 'n8n',
   };
   $json.raw = JSON.stringify(payload);
   return items;
   ```

3. Crypto node (HMAC)
   - Operation: HMAC
   - Algorithm: SHA256
   - Secret: the CRM `WEBHOOK_SECRET` (use n8n credentials/vars)
   - Value: `{{$json.id + '.' + $json.timestamp + '.' + $json.raw}}`
   - Output: Hex
   - Save to: `signature`

4. HTTP Request node
   - Method: POST
   - URL: `https://<crm-host>/webhook`
   - Headers: `content-type=application/json`, `x-id={{$json.id}}`, `x-timestamp={{$json.timestamp}}`, `x-signature={{$json.signature}}`
   - Body: `{{$json.raw}}` (send the exact string you hashed)

Local testing

- Start CRM locally, then: `node scripts/sign-webhook.js --secret <WEBHOOK_SECRET> --body '{"test":true}'`
- Paste the curl output with `CRM_URL=http://localhost:3005`

Notes

- If Redis is configured in CRM, replayed `x-id` will be rejected for 5 minutes.
- Keep payloads small and deterministic; avoid extra whitespace that changes the hash.
