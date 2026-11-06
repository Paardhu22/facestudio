# CLAUDE.md

**Before planning or changing any code in this repository, read [`SKILLS.md`](./SKILLS.md) in full.**

`SKILLS.md` is the single source of truth for FaceStudio's product scope, design system, architecture,
engineering rules, feature specifications, decisions (ADRs), iteration history, and current status.

Every iteration must follow the *Mandatory iteration protocol* at the top of `SKILLS.md`:

1. Read `SKILLS.md` and the relevant source.
2. Plan the change against its rules.
3. Implement, then run `npm run typecheck`, `npm run lint`, and `npm test` (plus `npm run test:e2e` for UI flows).
4. Update `SKILLS.md` so it matches the code, append an iteration entry to §G, and rewrite §H.
5. Report the actual results. Never claim a check passed unless it ran.

Do not change a stable rule in `SKILLS.md` without recording the reason as an ADR in §F.

Local conventions:
- Dev server port: **3100**.
- Stop processes by explicit PID only. Never use `pkill` or `killall` patterns.
