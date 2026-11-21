# Vocab
Offline-first flashcards · Korean ⇄ English · back side EN / UZ / RU · web + Android APK.

## Run
```bash
./install.sh          # deps, fonts, .env, config, android project
./install.sh admin    # http://localhost:4321  (admin)  ·  /app/ (app preview)
./install.sh apk      # build + install on USB phone
```

## Add vocabulary
Admin → **Add +** → word → **Publish** (= `git add data && commit && push`).
Phones see new / updated sets in **Vocabulary**; downloaded sets auto-update when online.

## Data (`data/`)
- `index.json` — auto-generated list (title, count, languages, version)
- `sets/<id>.json` — `{id,title,learn:"ko"|"en",back:[…],items:[{id,word,pron,ex,tr:{en:{m,d,x}}}]}`
  `m` meaning · `d` definition · `x` example translation · `ex` example in the learned language

## One-time Supabase (Google login only)
1. Authentication → Providers → Google: enable.
2. Authentication → URL Configuration → Redirect URLs:
   `com.vocab.app://auth` · `http://localhost:4321/app/` · your Pages URL
3. `.env` (Project Settings → API Keys):
   SUPABASE_URL · SUPABASE_PUBLISHABLE_KEY (`sb_publishable_…`) · SUPABASE_SECRET_KEY (`sb_secret_…`, admin only)

## Web
GitHub → Settings → Pages → Source: **GitHub Actions** (workflow included).
