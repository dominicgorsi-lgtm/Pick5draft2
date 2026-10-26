# Five Wide — interview vulnerability lab

This branch intentionally contains **six security vulnerabilities** for a football-pool interview. The normal app is preserved on `main` in `/workspace/football-pool`.

```sh
npm run interview
```

Open http://127.0.0.1:3001/presentation for the guided rehearsal, or `/slides` for the nine-slide deck. Your presenter login is `presenter@pool.test` with sample password `Interview-only-2026!`. Requires Node.js 24+. All data is synthetic, stored in memory, and reset on restart. The service binds only to localhost, does not load `.env`, and disables live provider calls. Do not publish or forward it.

[INTERVIEW.md](INTERVIEW.md) contains credentials, a prioritized issue list, reproducible examples, expected impact, and recommended fixes. `npm test` validates the exercise paths. Browser execution of the XSS demonstration remains unverified.

[PRESENTATION.md](PRESENTATION.md) includes the 12–15 minute script, account roster, audience participation, reset instructions, and evidence capture. Seed data includes a completed $500 split-pot week, a prior rollover, and 25 player accounts. All results are simulated.
