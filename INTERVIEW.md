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

## Why this order

The ordering assumes an internet-hosted pool with the existing invite-only registration, ordinary player accounts, and commissioner-managed payments. All six exercise endpoints require a signed-in account. Priorities reflect business impact, scope of access, ease of exploitation, and whether another user must take an action. They describe the hypothetical deployed flaws; this local lab uses synthetic data and cannot move money.

1. **V2 — Role mass assignment: broadest control, immediate exploitation.** An ordinary player can become commissioner with one profile request and no victim interaction. That role authorizes operations across the pool, including recording results and settling weeks. Its scope is broader than changing one award, so it ranks first. The rating concerns application administrator privileges, not server or operating-system access.

2. **V6 — Payout tampering: direct damage to the money ledger.** A player can record an award exceeding the pot without a winning entry or commissioner approval. This immediately breaks a core accounting rule and could cause an incorrect payment if the commissioner trusts the ledger. It ranks just below role escalation because it controls a narrower operation. The app records awards; it does not automatically transfer funds.

3. **V1 — SQL injection: broad disclosure through one request.** A player can turn game search into queries against unrelated tables. The reproduction shows account emails and roles; other readable tables can expose password hashes, sealed picks, and payout records. This is broader than reading one entry and requires no victim action. It ranks below the first two because the demonstrated SELECT injection establishes database reads, not arbitrary writes, command execution, or administrator access. Confirming stronger capabilities would raise its priority.

4. **V4 — Stored XSS: potentially privileged actions, with a viewer dependency.** The stored name reaches other users' browsers when they view Standings. Injected same-origin JavaScript could read data and make requests using that viewer's existing session, including commissioner requests if the commissioner views the payload. HttpOnly cookies do not prevent such requests. It ranks below SQL injection because someone must render the affected page, and the victim's privileges determine the impact. The tests confirm storage and the unsafe HTML sink; browser execution remains unverified.

5. **V3 — Sealed-pick IDOR: easy, targeted confidentiality loss.** An authenticated player changes a user ID to read another player's card before release. This is easy to automate across the small roster and undermines the promised secrecy and competitive fairness. It ranks below SQL injection because the exposed data is narrower, and below XSS because it does not grant actions as another user. Early disclosure alone does not change results, roles, or awards.

6. **V5 — Deadline bypass: serious fairness risk, with remaining checks.** A direct API request bypasses the browser's deadline restriction, so a player can submit or replace an entry in a closed but unsettled week. The remaining server checks still require five different, scheduled games and an open, locked week; finalized games and settled weeks are rejected. That narrows the demonstrated impact compared with direct administrative or payout control. It remains High because late information can create an unfair advantage. If a completed game remains marked scheduled until score sync, its known outcome could be used to cheat; that scenario would move this issue above sealed-pick disclosure.

**When to change the order:** Raise XSS if commissioner exposure is routine or browser execution is confirmed; raise SQL injection if writes or session compromise are demonstrated; raise the deadline bypass if known-result picks are accepted; and treat payout tampering as an immediate payment incident if an automated payment system trusts those awards. The list is a remediation starting point, not a universal severity order.

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
