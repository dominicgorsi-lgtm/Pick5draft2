# One real bug, one fix, one retest

The hosted demo now opens a normal player-card screen with one deliberate broken ownership check. It uses simulated accounts and its own in-memory database. The normal pool at the website root has separate records and sessions.

## Open and show the bug

After Render deploys the latest main commit, open `/demo/exercise` or `/demo/presentation` on your website. The home page links to it.

1. Click **Sign in as Alice**. The screen shows Alice, role player, account 2.
2. Click **Bob’s card · ID 3**. Alice stays signed in, but Bob’s five away picks load.
3. Change the first game from the away team to the home team. Click **Save Bob’s picks**.
4. The response shows actor Alice (player) and owner Bob. This is an actual write to the synthetic database, not an illustrative response.
5. Click **Sign in as Bob** and confirm his first pick changed.

Alice and Bob use `alice@pool.test` and `bob@pool.test`, with sample password `Interview-only-2026!`. Neither is commissioner. You can also see the target ID in the address `/demo/exercise?player=3`.

## Explain the issue

The server authenticates the caller but does not verify that the requested entry belongs to them. This is broken object-level authorization, commonly called IDOR. One missing ownership rule permits both the unintended read and the unintended write.

The affected route is `GET/POST /demo/api/entries/:playerId`, implemented in `demo/server.js`. It validates a session, a player role, five valid picks, and an open deadline. The intentional omission is the comparison between the authenticated user's ID and the requested owner's ID.

## Ask Codex to fix it

Use this prompt during your presentation:

> Fix the pick-ownership bug in the hosted demo. Alice must not be able to read or modify Bob's entry through GET or POST /demo/api/entries/:playerId. Enforce ownership on the server before reading or writing. Add regression tests that expect 403 and verify Bob's picks do not change, while Alice can still edit her own card. Push the fix to main for Render deployment.

Do not fix it by hiding the Bob button. The direct API request must be denied.

## Deploy and retest

1. Wait for the patched commit to be Live in Render. Use Deploy latest commit if auto-deploy is off.
2. Keep the exercise tab open across deployment; the last save body is stored in that tab's session storage.
3. Sign in as Alice again because redeploy resets demo sessions and data.
4. Click Bob's card. It should return 403.
5. Click **Repeat last save request**. The same cross-player POST should return 403.
6. Sign in as Bob and verify his original away picks are unchanged.
7. Sign in as Alice, open My card, and save her own five picks. That should still work.

The test proves both that the unauthorized action is blocked and that normal use continues to work.

## Reset and scope

Reset simulated pool restores fixture picks and signs demo users out, then signs Alice in. It clears the saved replay request, so do not reset between capturing your request and retesting the deployed patch. A server restart resets demo data but not the saved request in an open browser tab.

The intentionally flawed route can only reach the synthetic database under `/demo`; it does not use normal pool sessions, records, or provider keys. All names, scores and awards are simulated. The older six-case comparisons are no longer the main presentation route.

## Verification

`node --test test/rules.test.js test/hosted-demo.test.js` currently checks that Alice really can change Bob's picks in the intentionally vulnerable baseline, that Bob observes the change, that invalid cards are still rejected, and that normal pool records are separate. When implementing the patch, replace the vulnerability reproduction assertions with denial and no-mutation regression tests. The current test is a demonstration baseline, not a claim that the ownership boundary is secure.
