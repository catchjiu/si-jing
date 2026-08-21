# Queen Sisi

Private task management platform for a two-person BDSM dynamic — Queen assigns, D submits proof.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind + shadcn/ui
- **Supabase** — Auth, PostgreSQL, RLS, Storage, Realtime
- **Coolify** — Docker (`output: "standalone"`)

## Local development

```bash
cp .env.example .env.local
# Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Create the two accounts (no public signup)

In the **Supabase Dashboard → Authentication → Users → Add user**:

1. **Queen Sisi**
   - Email / password of your choice
   - User Metadata (JSON):
     ```json
     { "username": "Queen Sisi", "role": "queen" }
     ```

2. **D**
   - Email / password of your choice
   - User Metadata (JSON):
     ```json
     { "username": "D", "role": "slave" }
     ```

The `handle_new_user` trigger copies metadata into `public.users`.

Also disable public signups: **Authentication → Providers → Email → Disable “Confirm signup” / turn off open registration** as preferred for a private app.

## Coolify deployment

1. Create a new resource from this Git repo (or upload).
2. Build pack: **Dockerfile**
3. Set build & runtime env vars:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Expose port **3000**
5. In Supabase Auth → URL Configuration, add your Coolify domain to Redirect URLs:
   - `https://your-domain.com/auth/callback`

Or locally:

```bash
docker compose up --build
```

## Routes

| Path | Access |
|------|--------|
| `/` | Login |
| `/forgot-password` | Password reset |
| `/dashboard` | Role-specific home |
| `/dashboard/tasks` | Task list + filters |
| `/dashboard/tasks/new` | Queen: assign task |
| `/dashboard/task/[id]` | Detail / submit / review |
| `/dashboard/journal` | Shared journal |
| `/dashboard/story` | Shared stories (rich text; slave Claude rewrite) |
| `/dashboard/submissions/[id]` | Media, approve/reject, comments |
| `/dashboard/profile` | Avatar + stats |

Set `ANTHROPIC_API_KEY` for slave story rewrite via Claude.

## Supabase project

Already wired to project **queen sisi** (`oqsxhjhzszlnjbbamuvp`) with schema, RLS, and `submissions` storage bucket applied.
