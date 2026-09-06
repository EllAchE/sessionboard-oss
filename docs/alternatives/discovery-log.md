# Alternative-design candidate inventory

Recorded after the Discord/GitHub discovery pass and before cloning on 2026-08-16. No private
message text, credentials, or tokens are included.

## Public source repositories reachable for analysis

All were shared in the Kill My SaaS Discord `#general` channel unless a different discovery note
is shown.

1. `0xOsprey/saas-killa` — https://github.com/0xOsprey/saas-killa
2. `adityak6798/ManageMyConference` — https://github.com/adityak6798/ManageMyConference
3. `agrimsingh/conference-engine` — https://github.com/agrimsingh/conference-engine
4. `akakabrian/sessionslate` — https://github.com/akakabrian/sessionslate
5. `blockbrain-ai/speakerops` — https://github.com/blockbrain-ai/speakerops
6. `CampbellVentures/smolboard` — https://github.com/CampbellVentures/smolboard
7. `caseymanos/opensession` — https://github.com/caseymanos/opensession
8. `ChaiWithJai/open-speaker-operations` — https://github.com/ChaiWithJai/open-speaker-operations
9. `chuchuisrich-rgb/speaker-harmony` — https://github.com/chuchuisrich-rgb/speaker-harmony
10. `conorbronsdon/callboard-app` — https://github.com/conorbronsdon/callboard-app
11. `d4mr/opensesh` — https://github.com/d4mr/opensesh — resolved by exact public GitHub name search from the shared `opensesh.io` submission
12. `EquipeAI/stagestack` — https://github.com/EquipeAI/stagestack — resolved by exact homepage match from the shared `stagestack.dev` submission
13. `getzenai/untitledconference` — https://github.com/getzenai/untitledconference — resolved by exact public GitHub name search from the shared live submission
14. `guangyusong/opencallboard` — https://github.com/guangyusong/opencallboard
15. `iankar8/event-manager-os` — https://github.com/iankar8/event-manager-os
16. `jpoehnelt/session-party` — https://github.com/jpoehnelt/session-party
17. `M31-Labs/rostrum` — https://github.com/M31-Labs/rostrum
18. `maddiedreese/ProgramLoom` — https://github.com/maddiedreese/ProgramLoom
19. `mauricedesaxe/openboard` — https://github.com/mauricedesaxe/openboard
20. `mkly/gatherpulse` — https://github.com/mkly/gatherpulse
21. `mrmichael73/greenroom-kms` — https://github.com/mrmichael73/greenroom-kms
22. `nayamoss/namos-sessions-public` — https://github.com/nayamoss/namos-sessions-public — resolved by exact homepage match from the shared `namos-sessions.xyz` submission
23. `openrostrum/openrostrum` — https://github.com/openrostrum/openrostrum
24. `Phantastic-AI/fireside` — https://github.com/Phantastic-AI/fireside
25. `realgenekim/curtain-call-cfp` — https://github.com/realgenekim/curtain-call-cfp — resolved from the entrant's public GitHub account after the Discord post named the CFP Killer project but did not include its repository URL
26. `SteveMLC/lectern` — https://github.com/SteveMLC/lectern
27. `TheThingInTheThing/namos-sessions-webapp` — https://github.com/TheThingInTheThing/namos-sessions-webapp — second public repository with the exact shared Namos homepage; relationship to the public-release repo to be determined from code
28. `thedatadavis/seshmesh` — https://github.com/thedatadavis/seshmesh
29. `twilwa/session-bored` — https://github.com/twilwa/session-bored
30. `westoque/session-hero` — https://github.com/westoque/session-hero
31. `yisding/openboard.events` — https://github.com/yisding/openboard.events
32. `red/omotenashi` — https://forge.smol.ai/red/omotenashi/ — public Forge repository shared with the live submission; `git ls-remote` succeeded

## Repository link found but not publicly reachable

33. `everyai-com/grandstage-app` — https://github.com/everyai-com/grandstage-app — shared with the GrandStage live submission; GitHub currently returns `Not Found`, so it will not be cloned or accessed

## Project submissions found without a public source repository

These remain in the denominator as project candidates but cannot receive a source-code analysis.
Exact-name and/or homepage GitHub searches produced no matching public repository.

- Board to Death — `board-to-death.vercel.app`; likely an early deployment name for `mkly/gatherpulse` because the same author later shared that repository, pending source confirmation
- Greenroom by Faris Hussain — `greenroom.greenroom.workers.dev`
- Marquee by Stage 11 Agentics — project named in Discord; only the separate Lattice scheduler repository was shared
- Milk by Tyler — `milk.animasai.co`
- OpenSession by Malik — `opensession.opensession.workers.dev`; distinct author and deployment from `caseymanos/opensession`
- ProgramKit by andheller — `programkit.dev`
- Session submission by Ajay K — `session.drawset.com`
- SuperStage by Ali Zaid — `superstage.alizaidkhoso.workers.dev`

## Discovery accounting before cloning

- Source-repository records found: **33**
- Publicly reachable source repositories: **32**
- Source repository unavailable: **1** (`everyai-com/grandstage-app`)
- Additional live/name-only project candidates without public source: **8**, including one likely alias pending code inspection

## Narrow Discord refresh — 2026-08-17

After the first survey preview was shared, the server was searched incrementally for recent requests
to add or refresh a submission. The search ran through the latest indexed message at the time of the
refresh. It was read-only, stopped after the targeted result set, and did not retain credentials or
private message content.

### Newly reachable public source

1. `Frostbite1536/greenroom` — <https://github.com/Frostbite1536/greenroom> — Jeremy Limitless asked for the live Greenroom submission to be added and supplied both repository and <https://greenroom-hq.com/>.
2. `DeanStr/programcue` — <https://github.com/DeanStr/programcue> — Dean supplied the repository and <https://programcue.com/> after being tagged in the narrow refresh request. Only the public source and landing URL were retained; no gated-evaluation credential was used or recorded.
3. `MoizIbnYousaf/open-events` — <https://github.com/MoizIbnYousaf/open-events> — Noah asked for <https://openevents.engineer/> to be added and had shared the repository earlier in the same server.

All three repositories were cloned into a temporary scratch directory, read at the commits pinned in
`data/projects.json`, and received full baseline and beyond-the-brief analysis notes.

### Requests inventoried without public source

- **ChartStead by Tyler** — <https://ChartStead.com/>. Tyler's earlier `milk.animasai.co` link was described as a design bench test; the later add request identifies ChartStead as the submission. The existing participant record was renamed rather than double-counted. No public repository was shared.
- **Bodhi submission** — Bodhi asked how to join the list but did not include a deployment or repository, and targeted searches of the author's earlier server messages found neither. The request is inventoried pending public source.

### Already tracked or source-correction messages

- Yi Ding's report that several GitHub links were broken led to replacing every SSH-style `git@github.com:` source in the dataset and analysis notes with a browser-safe HTTPS repository URL.
- `realgenekim/curtain-call-cfp` was already analyzed. The entrant later supplied an official GitLab public snapshot at <https://gitlab.com/realgenekim/curtaincall-cfp-public/>. That snapshot is recorded here as an additional discovery, but the matrix remains pinned to the previously analyzed GitHub commit; the updated snapshot was not silently substituted without a full re-score.
- `adityak6798/ManageMyConference` was already in the matrix when its author posted a later build. The narrow refresh did not spend a second full-project pass on already tracked entries unless a source correction was required.

### Accounting after the narrow refresh

- Project candidates inventoried: **45**
- Publicly reachable source repositories analyzed: **35**
- Source repository unavailable: **1** (`everyai-com/grandstage-app`)
- Live/name-only candidates without public source: **9**
