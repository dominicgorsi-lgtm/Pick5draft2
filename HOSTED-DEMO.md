# Hosted Five Wide presentation

This version ships on `main` with the existing Render Docker setup. After Render deploys the latest commit, use your existing website URL with these paths:

- `/demo/presentation` — actor switching, case studies and response comparisons.
- `/demo/slides` — nine slides with speaker notes (press N).
- `/demo/` — the simulated football pool and player pick board.

`/presentation` and `/slides` redirect to their demo equivalents. The home page links to the console.

## Demo login

**Presenter:** `presenter@pool.test`  
**Sample password:** `Interview-only-2026!`

These credentials belong to the simulated pool only. They do not sign into the normal pool at the website root. Use the console's actor buttons or roster to switch to Alice, Bob, Maya or Guest. Every fixture account uses the same sample password.

The demo includes 25 player accounts, two administrators, a prior $250 rollover, and a completed $500 week split equally between Bob and Maya. Alice and Guest start without current entries so you can demonstrate normal picks. All teams, spreads, scores, identities and awards are fictional.

## Honest comparisons

The hosted presentation shows **illustrative vulnerable outcomes** beside **actual guarded responses**. It does not execute the six intentional vulnerabilities:

- Search values are parameterized.
- Players cannot assign themselves an administrator role.
- Other players' current entries remain sealed.
- Player names render as text under a CSP that blocks inline handlers.
- The server rejects expired-week submissions.
- Players cannot choose their award amounts.

The left pane is explicitly labeled as an educational example. The right pane displays the actual response from a request to the hosted site. The comparison report download preserves that distinction. A stored HTML example is inert here; do not claim that the hosted site executed XSS.

For executable vulnerable cases, use the separate `interview-vulnerabilities` branch locally as described in its `PRESENTATION.md`. Its console, slides and fixtures remain available for laptop rehearsals.

## Data and sessions

The hosted demo has its own in-memory SQLite database and a `demo_pool_session` cookie scoped to `/demo`. It neither seeds the normal database nor uses the normal account session. Demo presenter permissions apply only to simulated records. Demo provider calls are disabled; no Odds API key is needed.

All visitors share the same demo state. Use a second browser profile or private window for another simultaneous actor. Every tab in one browser profile shares its demo login.

Switch to the original presenter account and choose Reset rehearsal data to restore the fixture records. Reset signs other demo sessions out. Restarting or redeploying the service also resets the demo. Normal pool records and sessions are separate and are not reset by the presentation console.

## Render deployment

No additional environment variables are required for the hosted presentation. The existing Dockerfile copies the `demo` directory. Pushes to `main` trigger deployment only if Render auto-deploy is enabled. Otherwise select Manual Deploy → Deploy latest commit in Render. Deployment success must be confirmed in Render; it is not established by a GitHub push.

## Verification

```sh
node --test test/rules.test.js test/hosted-demo.test.js
```

The tests verify route availability, fixture totals, all six guarded behaviors, inert name rendering, cookie and database separation, and preservation of a normal pool week and administrator session across demo reset. Browser layout and the actual Render deployment remain unverified in the workspace.
