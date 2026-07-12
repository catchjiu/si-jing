# Queen Sisi — Project Structure

```
src/
  app/
    page.tsx                 # Login (homepage)
    forgot-password/
    auth/callback/
    dashboard/
      layout.tsx             # Nav shell
      page.tsx               # Queen / Slave dashboards
      tasks/
      tasks/new/
      task/[id]/
      submissions/[id]/
      profile/
  components/
    auth/ layout/ dashboard/ tasks/ submissions/ comments/ ui/
  contexts/auth-context.tsx
  lib/
    supabase/                # browser, server, middleware clients
    database.types.ts
    types.ts format.ts youtube.ts
  middleware.ts              # Session + route protection
Dockerfile                   # Coolify / standalone Next.js
docker-compose.yml
supabase/migrations/
```
