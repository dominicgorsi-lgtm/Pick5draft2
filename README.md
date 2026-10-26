# Five Wide — interview vulnerability lab

This branch intentionally contains **six security vulnerabilities** for a football-pool interview. The normal app is preserved on `main` in `/workspace/football-pool`.

```sh
npm run interview
```

Open http://127.0.0.1:3001/interview. Requires Node.js 24+. All data is synthetic, stored in memory, and reset on restart. The service binds only to localhost, does not load `.env`, and disables live provider calls. Do not publish or forward it.

[INTERVIEW.md](INTERVIEW.md) contains credentials, a prioritized issue list, reproducible examples, expected impact, and recommended fixes. `npm test` validates the exercise paths. Browser execution of the XSS demonstration remains unverified.
