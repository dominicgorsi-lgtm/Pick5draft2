# Five Wide

An invite-only football pick’em pool for 25 players. Pick five NFL and college games against frozen spreads. Includes a responsive game board, player accounts, sealed entries, weekly standings, commissioner tools, score grading, an audit log, and exact-cent rollover accounting.

## Run

Requires **Node.js 24+**. Uses built-in SQLite with no npm dependencies.

```sh
cp .env.example .env
# Edit .env: commissioner email, 12+ character password,
# random pool invite code, and your own ODDS_API_KEY.
npm start
```

Open http://localhost:3000. Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. The commissioner account is separate from the 25 player spots. Register a player account too if participating. Initial administrator credentials are created only if no administrator exists; changing the environment password does not reset an existing account.

1. Under Commissioner, create a week using an upcoming Wednesday date.
2. Click Sync spreads to load eligible NFL and college games.
3. Share the app URL and invite code privately with players.
4. Keep the server running through line lock and the pick deadline.
5. Sync scores, review postponed/canceled games, and enter missing final results manually.
6. Once every selected game is final or void, settle the week. Settlement is immutable.
7. Create the next week: $250 is added to any prior rollover.

## Rules implemented

- Five **different** NFL or college games, one side per game.
- Lines freeze **Wednesday at 9 PM Pacific**.
- Picks open after line lock and close **Thursday at 11:59 PM Pacific**, at the start of that minute. Entries can be edited until the deadline.
- Pacific uses America/Los_Angeles, including daylight saving time.
- Eligible games start strictly after the pick deadline and before the following Tuesday at midnight Pacific. Thursday games already underway are excluded.
- Other players’ picks remain hidden until the deadline.
- **5–0 wins**. Pushes and voids are not wins.
- Multiple perfect entries split the pot; remainder cents go to earliest registered winners.
- **$250 total is added weekly**, not $250 per player. No winner means the full pot carries over.
- Awards are recorded; entry fees and payments are handled outside the app.

## Provider integration

Uses [The Odds API](https://the-odds-api.com/) for `americanfootball_nfl` and `americanfootball_ncaaf`, US spread markets, and final scores. Configure `ODDS_API_KEY` on the server. Default bookmaker: DraftKings; change `ODDS_BOOKMAKER` for another supported bookmaker. One bookmaker is used for consistent lines. Keys never reach the browser.

The server checks deadlines every minute and syncs every 15 minutes: spreads before cutoff, scores afterward. Each sync requests both leagues; check your provider plan and API quota. Manual sync also consumes quota. Score requests cover the most recent three days; enter older/missing results manually. Postponed games require commissioner review.

The latest fresh successful snapshot is frozen at Wednesday’s cutoff. No new quotes are accepted after cutoff. Snapshots older than 20 minutes block picks. Failed or late provider responses preserve the prior snapshot. With no valid snapshot, the commissioner can cancel the unplayable week after cutoff and carry the full pot forward. Picks are never reopened after a deadline.

**Live access is unverified:** no API key is configured. No fabricated odds or standings are displayed.

## Hosting

Run as a **Node service with a persistent disk**, with one process against the SQLite database. Set `HOST=0.0.0.0` for container hosting, `PORT` as required, and `DATABASE_PATH` to your persistent volume. Use HTTPS and `COOKIE_SECURE=true` for an internet deployment. This is not a static website or a service suitable for an ephemeral serverless filesystem.

Keep `.env`, SQLite data, backups, invite codes, and keys out of Git. Back up via SQLite’s online backup tooling or stop the service before copying all database files. Login and registration are rate-limited by directly connected IP; behind a reverse proxy this may be shared by players. No email verification, self-service password recovery, payment processing, or SSO is included.

No hosted deployment was created. Sites helper and browser preview tooling are unavailable in this environment. Browser visual QA remains unverified.

## Verify

```sh
npm test
```

Tests cover DST, ATS grading, five-pick validation, authentication, authorization, sealed entries, deadlines, capacity, stale snapshots, CSRF origin checks, logout, rollover, and a perfect week paying the accumulated pot. Integration tests use an isolated temporary database and never call a live provider.

## Repository

Source: https://github.com/dominicgorsi-lgtm/Pick5draft2

`main` contains the normal pool app. `interview-vulnerabilities` is an explicitly enabled, localhost-only exercise with synthetic in-memory data. See `INTERVIEW.md` on that branch for six intentional weaknesses, reproduction steps, and remediation priorities. Do not deploy the interview branch.
