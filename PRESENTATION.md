# Present Five Wide locally

A 12–15 minute application-security interview using a football pool as the business story. All people, results and awards are simulated. The exercise runs on your laptop, does not need an Odds API key, and never sends payments.

## Start here

```sh
git clone --branch interview-vulnerabilities https://github.com/dominicgorsi-lgtm/Pick5draft2.git
cd Pick5draft2
npm run interview
```

Requires Node.js 24+. No dependency installation is needed. If you already have the repo, check out `interview-vulnerabilities` and pull its latest commit first.

- **Slides:** http://127.0.0.1:3001/slides
- **Presentation console:** http://127.0.0.1:3001/presentation
- **Football app:** http://127.0.0.1:3001/

Use arrow keys for slides, **N** for speaker notes, and the Full screen button while presenting. Browser Print → Save as PDF provides a shareable slide artifact; hide speaker notes first if you do not want to include them.

## Your login and the cast

Every account uses the synthetic password **`Interview-only-2026!`**. These credentials are for the local lab only; they do not create an account in the Render-hosted normal application.

| Person | Login | Purpose |
|---|---|---|
| You / Dominic | `presenter@pool.test` | Presenter administrator; can reset the rehearsal |
| Commissioner | `commissioner@pool.test` | Second administrator account |
| Alice | `alice@pool.test` | Ordinary player used for the vulnerability proofs |
| Bob | `bob@pool.test` | Competitor whose current picks must remain sealed; last-week winner |
| Maya | `maya@pool.test` | Second last-week winner |
| Guest | `guest@pool.test` | An audience member makes their own five picks |

There are **25 player accounts plus two administrator accounts**. Expand Audience participation in the console for every name and login. Alice and Guest start without current picks; the other 23 cards are prefilled. Participants can change the prefilled cards through the normal pick board.

All tabs in one browser profile share a login. Use a separate browser profile or private window to keep an audience player signed in while the presenter stays signed in. Different people can take turns at the laptop using the account selector. A network-shared URL is intentionally not enabled.

## The simulated history

- **Week 1 — prior completed week:** $250 pot, no perfect entry, $250 carried forward.
- **Week 2 — last completed week:** $500 pot; Bob and Maya both went 5–0 and received $250 each. All 25 players have graded entries.
- **Week 3 — closed training exercise:** deadline is an hour before server startup, but games remain scheduled. It exists only to reproduce the late-entry flaw and does not participate in the historical accounting story.
- **Week 4 — current training exercise:** deadline is one day after server startup. Twenty-three of 25 players have submitted; picks are sealed. The displayed pot is $250.

Historical dates use the most recently completed Wednesday–Tuesday Pacific pool week. Teams, spreads and final scores are fictional; they are not a claim about last week's real football results. Training weeks use a relative clock so the demonstration works on any presentation day. Restart after a long break if that clock has expired.

## Run of show

### 0:00–2:00 — Make the pool understandable

Use slides 1–3. Sign in as Presenter. Open last week's results from the console and show the two perfect cards and equal awards. Point to the $250 rollover and the $500 pot. Then show the sealed current-week standings.

Say: “Twenty-five people trust three things: their picks stay private, the deadline applies to everyone, and the ledger pays the right people. I’m going to test those promises.”

Optional: sign in as Guest in a private window and let the interviewer select five different games. Submit the card and show the entry count move from 23 to 24. The normal UI supplies context before you show API-level abuse.

### 2:00–10:00 — Show consequences, not just payloads

Each **Run proof as Alice** button signs in through the normal login endpoint, restores Alice's sample name and player role if needed, and sends the displayed attack request. The left panel shows the actual vulnerable response. The right panel shows an actual guarded comparison. It illustrates the intended fix; it does not patch the original exercise routes.

| Scene | Show | Ask the audience | Expected evidence |
|---|---|---|---|
| V3 / sealed entry | Request Bob's week-4 card as Alice | “Is being logged in enough?” | Vulnerable read returns five picks; guarded read returns 403 |
| V5 / deadline | Submit Alice's five picks to week 3 | “Does a disabled button enforce a deadline?” | Vulnerable write succeeds; guarded write returns 403 |
| V1 / SQL injection | Search for synthetic account records | “Where did data become an instruction?” | Search returns account emails/roles; parameterized query returns no matches |
| V4 / stored XSS | Save the harmless HTML marker, then open affected standings | “Whose browser is executing this?” | If it executes, a green XSS proof banner appears in that browser; guarded pane displays inert text |
| V6 / payouts | Record $999.99 for Alice in settled week 2 | “Should any player choose an award amount?” | Total awards become $1,499.99 against a $500 pot; guarded request returns 403 |
| V2 / role escalation | Change Alice's role to admin | “Which field changed the trust boundary?” | Alice's role becomes admin and the Commissioner tab appears; guarded request returns 403 |

Role escalation comes last in the narrative because it changes the account's authority. Its remediation priority is first. Demonstration order and engineering priority answer different questions.

The XSS payload only sets a DOM marker. The pool app adds a visible banner after observing that marker. Do not claim you saw browser execution until you have opened the affected standings and observed it yourself; automated tests cover storage and the unescaped HTML sink only.

### 10:00–13:00 — Defend your priorities

Use slides 5–7 and the detailed rationale in [INTERVIEW.md](INTERVIEW.md#why-this-order). Lead with commissioner control and financial integrity, then discuss SQL injection's broader reads, XSS's viewer dependency, sealed-pick confidentiality, and deadline enforcement's remaining checks.

Ask: “Would you change the order if payouts were automatic, or if a late pick could use a known final score?” Explain why those changes raise the corresponding risk. State the assumptions instead of presenting a universal severity ranking.

### 13:00–15:00 — Explain what a fix must prove

Use slides 8–9. Describe the negative tests you would require: no unauthorized role changes, no sealed-pick disclosure, no late API writes, no query manipulation, no executable player names, and exact conservation of the pot. Confirm normal player actions still work after a repair.

End with: “The finding is the starting point. My job is to connect it to business impact, choose a defensible order, and verify the boundary after the repair.”

## Rehearse and recover

- Run `npm test` before presenting.
- In the console, switch to Presenter and click **Reset rehearsal data**. This restores names, roles, results, awards and entries, resets the console's progress, clears its saved evidence, and signs other sessions out. The presenter receives a new session automatically.
- Other open app tabs can still display an old response. Reload them after a reset. Existing tabs may need to sign in again.
- **Save proof responses** downloads JSON of the actual responses collected in that console session. Save it before resetting if you want a backup record. It contains simulated data only and does not include session cookies.
- You can rerun a scene. The role and name preparation is disclosed below each proof; do not describe that setup request as a separate finding.
- Keep one private window ready for an audience actor. Keep the completed-week standings in another tab for a quick return to the business story.
- If the server is restarted, all changes disappear and the seeded cast returns. The console's explored-scene markers are browser preferences; Reset clears them.

No published service is required. The normal app remains on `main` for Render; this branch deliberately refuses public bind addresses.
