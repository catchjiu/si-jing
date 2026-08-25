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

Set `ANTHROPIC_API_KEY` for Claude story rewrite, and/or `XAI_API_KEY` for Grok rewrite + blog covers.
Optional: `ANTHROPIC_STORY_MODEL`, `XAI_STORY_MODEL` (default `grok-4.5`), `XAI_IMAGINE_MODEL` (default `grok-imagine-image-2.0`).
Upload Queen/slave **face reference** photos on Profile so Grok can match faces on story covers.

Story **Listen** uses [Fish Audio](https://fish.audio/) dual-voice TTS. Stories keep a **reading** HTML body plus a separate **listen script** (`Queen:` / `Slave:` lines) used only for audio. Listen auto-builds that script from the reading version when missing or stale. Set `FISH_API_KEY`, `FISH_QUEEN_VOICE_ID`, and `FISH_SLAVE_VOICE_ID`. Optional: `FISH_TTS_MODEL` (default `s2.1-pro`, or `s2.1-pro-free`). Use the **one best voice clone** per person in those IDs. Queen/slave turns are synthesized separately (Queen default speed `1.2` via `FISH_QUEEN_TTS_SPEED`; slave `FISH_SLAVE_TTS_SPEED`). Sampling defaults favor stability (`temperature` 0.3, `top_p` 0.75, `condition_on_previous_chunks`); override with `FISH_TTS_TEMPERATURE` / `FISH_TTS_TOP_P` if needed.

After deploy, run the SQL migration that adds `stories.listen_script` and `stories.listen_body_hash` (see `supabase/migrations/20260825170000_story_listen_script.sql`).

To backfill listen scripts for existing stories (requires `SUPABASE_SERVICE_ROLE_KEY` + Claude or Grok key):

```bash
npm run refresh-story-listen
# or: npx tsx scripts/refresh-story-listen-scripts.ts --force --provider=claude
```

Options: `--force` (rebuild even if fresh), `--dry-run`, `--limit=N`, `--provider=claude|grok`.

Slave-only **Insults** on Story: save lines, play/download them in Queen’s Fish voice (`FISH_QUEEN_VOICE_ID`). Requires the `story_insults` table (see `supabase/migrations/20260825180000_story_insults.sql`).

## Supabase project

Already wired to project **queen sisi** (`oqsxhjhzszlnjbbamuvp`) with schema, RLS, and `submissions` storage bucket applied.
