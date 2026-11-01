---
name: ui-audit
description: Audit-and-fix loop for one area of Eve's UI. Subagents use the app themselves in WebKit (Mac and phone windows), screenshot every step, and list what gets in a person's way; then you verify each finding, fix it with a regression case, and send out new auditors until a round finds nothing new. Ends in a release. Use when the user says "audit X", "find everything wrong with X and fix it", "loop until no new issues", "/ui-audit X".
argument-hint: <area, e.g. "diagram click editing", "tables on the phone">
---

# UI audit loop

The user is away on a phone. Do not stop to ask whether to go on. Each round: **audit** (subagents) → **check** (you) → **fix** (you) → next round. Stop when a round brings no new real finding. Then release.

Work out of a scratch folder: `AUD=<scratchpad>/ui-audit/<area-slug>`, with `round-N/` under it.

## 0. Set the scope (once)

Read the code for the area first: its components, `src/lib/*` helpers, and the e2e file that covers it. Then write `$AUD/scope.md`, which holds:
- **What a person does here:** a list of concrete tasks, such as "rename a pie slice", "add a mind-map branch on the phone".
- **The windows:** Mac 1200×900, and the phone at 390×844 (`--phone`). Add a narrow Mac or a keyboard-up phone if the area cares about them.
- **Known and left alone:** what is out of scope on purpose, with the reason. Auditors must not re-report these.

## 1. Audit: subagents drive the app

Spawn the auditors **in one message** so they run at once. While they run, edit nothing under `src/` and switch no branch in this checkout: they drive the live dev server and `drive.mjs` from here, and a change mid-run gives them a moving target (a switched branch once took `drive.mjs` away from under them). Use 2–4 `general-purpose` agents, each with a slice of the tasks in `scope.md`. One per window, or one per sub-area, is a good default. Give each one this brief, filled in:

> You are auditing Eve (Tauri + Svelte notes app) as a picky user would, on `<window>`. Area: `<area>`. Tasks to try: `<task list>`.
> Do not edit anything under `src/`. You only use the app and report.
> Drive it with `node .claude/skills/ui-audit/drive.mjs <note.md> <steps.mjs> $AUD/round-N/<you> [--phone]` from the repo root. Read the header of drive.mjs for the `t` helpers. Write the note and the steps file into `$AUD/round-N/<you>/`. Every step that changes the screen ends with `t.shot('<what>')`. Run at most 2 drive.mjs at once. On a phone, mimic the keyboard coming up with `t.page.setViewportSize({ width: 390, height: 470 })` after a tap.
> Then **open each screenshot with Read and look at it.** A step that ran without error proves nothing. Also read the saved markdown and the error list that drive.mjs prints.
> Report what gets in the way: things clipped or covering text, things that cannot be reached, wrong focus, a key that does nothing or does the wrong thing, a change lost on save, something ugly or unreadable, page/console errors, and anything that needs more than one obvious step.
> Do not report: `<known and left alone>`, `<already fixed in earlier rounds>`.
> Return only a list. One finding per item: `severity (blocker/annoying/cosmetic) · window · what you did → what happened → what you expected · screenshot path · the steps file that reproduces it`. If you find nothing, return `NONE` and the screenshot paths you checked.

## 2. Check every finding yourself

An auditor's report is a claim, not proof. A step file written for an earlier round can fail just because the UI it pokes has changed: tell those apart from real failures. And "not reproduced" is not "fine": a finding dropped that way goes into the scope as still suspect, and is tried again under other conditions (another spot on the part, a shorter window, a tap rather than a click) when it comes back. For each finding:
1. Open its screenshot with Read.
2. Rerun its steps file with drive.mjs.
3. Keep only the findings you can see for yourself.

Write `$AUD/round-N/findings.md` with two parts: the findings you kept, and the ones you dropped, each with its reason. Merge duplicates. Then add an "After round N" part to `scope.md` listing what is fixed now, what is deliberate, and what is left. That list is how the next round knows not to re-report them.

## 3. Fix

For each kept finding, follow CLAUDE.md:
- Write a failing case first. Put it in the guard for its class (the table in CLAUDE.md), or in the nearest `*.dom.test.ts` or `e2e/*.mjs`.
- Then fix it at the shared place the class names. Do not write a one-off beside it.
- Rerun the finding's steps file and look at the new screenshot.

After the round's fixes:

```bash
npm test
npx svelte-check --tsconfig ./tsconfig.app.json
```

Also run the WebKit e2e set from CLAUDE.md, and the e2e files that touch the area. Then run `git checkout -- e2e/out`.

## 4. Next round, or stop

- **Go to the next round** if this round had any kept finding. The new auditors get the previous rounds' findings under "already fixed". Rotate which agent gets which window or tasks, because fresh eyes find what familiar ones skip. Point each round at what the last round changed: a fix is where the next bug most often is.
- **Stop** when a round's auditors all return `NONE`, or return only findings you dropped.
- **Cap the loop at 6 rounds.** If you hit the cap, say what is left.

Give the user a one-line progress note in Korean after each round, e.g. "라운드 2: 7건 찾음, 5건 확인·수정, 2건 기각".

## 5. Finish

1. Commit and push, then open a PR (`gh ... -R happy-nut/eve`). Wait for CI. Squash-merge only once **every check passed**: `gh pr merge` here merges whatever CI said, so read `gh pr checks` first, and on a failure fix it and run it again. A run that finished is not a run that passed. Then release as the repo does (versions per CLAUDE.md "Conventions", then the `v*` / `android-v*` tags). Do not ask before any of these.
2. Send screenshots with SendUserFile: **one per fix, showing the fixed screen**, each with a one-line Korean caption. If something could not be shot, say so.
3. Report in Korean with a table: the round, what was found, what was fixed, what was dropped and why, and what is left. Include the measured test and e2e results.
