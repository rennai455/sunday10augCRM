# Architecture

## Overview

The system is a traditional web application:

- **Client** – static HTML/CSS/JS served from the `public/` folder.
- **Server** – an Express application (`server.js`) that exposes a JSON API and serves static assets under `/static`.
- **Database** – PostgreSQL accessed via a lightweight wrapper in `db/`.

## Diagram

```
          +-----------+
          |  Browser  |
          +-----------+
                |
           HTTP/JSON
                |
      +-----------------+
      |  Express Server |
      +-----------------+
                |
         PostgreSQL
```

Redis support is included as a dependency and may be introduced later for caching or rate limiting.

