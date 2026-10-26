# Five Wide: intentional vulnerability interview

This branch (`interview-vulnerabilities`) is a local training version of the football pool. The normal application remains on `main`. All fixtures are synthetic. The lab requires an explicit opt-in, binds only to `127.0.0.1`, stores data in memory, never reads `.env`, and disables provider syncing. Restart to reset it. Do not publish or forward its port.

```sh
npm run interview
```

Open **http://127.0.0.1:3001/interview** for exercise controls, or `/` for the football app. Use Node 24+. No dependencies are needed. All three fixture users have password `Interview-only-2026!`:

| User | ID | Role |
|---|---|---|
| commissioner@pool.test | 1 | admin |
| alice@pool.test | 2 | player |
| bob@pool.test | 3 | player |

Week 1 closed an hour before startup. Week 2 closes a day after startup. Each has six synthetic games and Bob’s five away picks. The listed pot is $250. The lab neither connects a real odds feed nor transfers money.

## Suggested remediation order

Priorities express the impact if these flaws existed in a deployed pool. They are not CVSS scores. V2 and V6 both undermine the money-handling boundary and should be addressed first.

| Order | Issue | Priority | Interview impact | Fix |
|---|---|---|---|---|
| 1 | V2: Mass assignment of `role` | P0 / Critical | A player becomes commissioner and gains administrative controls. | Allowlist editable profile fields; keep role changes in separately authorized admin operations. |
| 2 | V6: Client-controlled payouts | P0 / Critical | A player records an arbitrary award larger than the weekly pot. | Restrict settlement to commissioner; calculate awards from frozen entries and final scores server-side in an atomic, idempotent transaction. |
| 3 | V1: SQL injection in game search | P1 / High | Search reads unrelated account records. | Bind query parameters; return only explicitly selected public fields. |
| 4 | V4: Stored XSS in player names | P1 / High | An attacker’s name executes JavaScript when another player views Standings. | Render names as text or escape HTML; restore a CSP without inline script execution. |
| 5 | V3: IDOR exposing sealed picks | P1 / High | A player reads a competitor’s card before the deadline. | Check ownership and release time on every entry read, including alternate endpoints. |
| 6 | V5: Client-only deadline enforcement | P1 / High | A player submits picks to a closed week by sending an API request directly. | Validate the selected week, lock state, and deadline on the server at write time. |

## Reproduce locally

Sign in as Alice using the controls. Run each exercise independently after a restart if needed; V2 changes the current account’s role and therefore affects other player-only operations.

### V1 — SQL injection (CWE-89)

The `/api/lab/search?q=...` handler directly interpolates input into SQLite. In Game search, use:

```sql
%' UNION SELECT CAST(id AS TEXT),email,role FROM users -- 
```

Account emails and roles appear in game-search results. These are fixture accounts only. This demonstrates unauthorized table reads, not arbitrary operating-system execution.

### V2 — Mass assignment / privilege escalation (CWE-915)

In Player profile, submit:

```json
{"name":"Alice","role":"admin"}
```

Refresh the pool app: the Commissioner tab appears, and the account can call commissioner endpoints. Authentication still exists, but the profile endpoint allows a privilege-bearing field. Reset before the other player exercises.

### V3 — Insecure direct object reference (CWE-639)

While signed in as Alice, request player ID **3**, week **2** in Sealed entry lookup. The response includes Bob’s five picks before the deadline. The normal `/api/state` still seals entries: the alternate lookup bypasses that protection.

### V4 — Stored cross-site scripting (CWE-79)

While Alice is still a player, submit five picks for week **2** using Deadline enforcement. Save this profile:

```json
{"name":"<img src=x onerror=\"document.body.dataset.interviewXss='executed'\">"}
```

Visit the pool app and select Standings. Check `document.body.dataset.interviewXss` in browser developer tools: it should read `executed`. The name is inserted without escaping, and the lab CSP permits inline handlers. The demonstration sets a harmless DOM marker; it does not exfiltrate anything. HttpOnly cookies do not stop injected scripts from making same-origin requests.

### V5 — Deadline bypass (CWE-602)

As Alice, use Deadline enforcement to submit five picks for week **1**. The server accepts the entry even though the week’s deadline passed an hour before startup. In the pool app, select the closed week in Standings to see the new entry. The frontend still disables the pick controls for that week.

### V6 — Payout tampering (CWE-840)

As Alice, use Payout integrity to submit **99999** cents. A **$999.99** award is stored against a **$250** pot. Week 1’s standings show the award after Alice has a submitted entry. No real money is moved. The endpoint trusts a client amount rather than authorizing settlement and calculating the award.

## Verification and limitations

`npm test` runs rule tests and an isolated lab integration test. It verifies five server-side reproductions, stored XSS data flow into unescaped leaderboard HTML, and lab startup containment. Browser JavaScript execution has not been manually verified in this environment. The original production-server integration test belongs to `main`; it is replaced on this branch by tests that deliberately expect the six weaknesses to exist.

The lab’s loopback bind is a development guard, not a defense if someone publishes or forwards the service. Keep it local. The example credentials and injected code are confined to synthetic fixtures.
