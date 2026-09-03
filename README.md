# Workout Planner

A mobile-first browser workout planner and tracker. The web app stores routines, workout history, and PB data in the browser with `localStorage`, and can sync signed-in users through Supabase.

## Run

Open `index.html` in a browser, or serve the folder locally:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Features

- Create, edit, delete, and select workout routines
- Start today's workout from the most recent completed workout of the same routine
- Save actual individual workout sets with weight, reps, completion status, and timestamps
- Reopen the same day's workout to add more sets later
- Track weight, reps, completed sets, and PB-marked exercises
- View routine and exercise trend graphs
- View PB History beneath the graph
- Export all browser data to JSON
- Import desktop or browser JSON data into browser storage
- Sign in with Google and sync each user's data to their own Supabase row
- Start from a sign-in/guest landing screen; guest mode uses browser storage only
- Creating new routines requires Google sign-in
- Installable PWA shell with offline caching

## Workout History

Browser storage now keeps a versioned historical model alongside legacy fields: exercises, routine definitions, workout sessions, workout exercises, and individual workout sets. Legacy summaries such as `3x8` are migrated into individual set records and tagged as summarized legacy data. The migration is idempotent and creates a localStorage backup before upgrading older browser data.

## Supabase

The live app is configured for the `Workout Planner` Supabase project. The database schema is mirrored in `supabase/schema.sql`. Only the publishable browser key is stored in this repo; Google OAuth client secrets stay in Supabase/Google Cloud.
