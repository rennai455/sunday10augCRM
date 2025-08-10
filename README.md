# sunday10augCRM

Prepared for GitHub import.

## Quick start

From the project root (top-level folder of your code):

```bash
chmod +x push.sh
./push.sh
# or: ./push.sh git@github.com:rennai455/sunday10augCRM.git
# or: ./push.sh https://github.com/rennai455/sunday10augCRM.git
```

The script will:
- init git (if needed)
- create/force `main` as default branch
- set `origin` to your repo
- push the initial commit

## Configuring API Base URL

The frontend reads the API root from a global `API_BASE_URL` variable. If the
variable is missing, requests default to `/api`.

### Via `<script>` tag

Add a small script before loading your bundled app:

```html
<script>
  window.API_BASE_URL = 'https://your-domain.example/api';
</script>
<script src="/scripts/app.js"></script>
```

### Via Railway environment variable

1. In your Railway project, add an environment variable named `API_BASE_URL`.
2. Inject it into your HTML (for example, using a template engine) before
   serving the page:

```html
<script>
  window.API_BASE_URL = '<%= process.env.API_BASE_URL %>';
</script>
```

This allows different deployments to point the frontend at the correct API
server without rebuilding the client.
