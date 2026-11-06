# T3 Mods maintenance

This is Chris's personalized T3 Code fork. The integration and GitHub default branch is
`t3-mods`, starting from stock v0.1.7 plus the voice message player.
The historical `studio/voice-player-only` branch preserves the voice-player baseline.

- `origin`: https://github.com/cbsimpson4242/t3code — personal modifications.
- `upstream`: https://github.com/pingdotgg/t3code — original project, with pushes disabled locally.

Run all repository commands over direct SSH on hermes-worker or the Grok VM.
The Controller checkout is a passive mirror. Do not use installed services or live
user data for development. UI work uses the latest available cloud Claude Sonnet
through T3/Hermes delegation, with repository work on an approved worker.

## Feature worktrees and integration

On hermes-worker, start from the current integration branch:

```sh
cd "/home/chris/projects/T3 Mods/source"
git fetch origin
git switch t3-mods
git pull --ff-only origin t3-mods
git worktree add -b mods/my-change "../my-change" t3-mods
```

Each worktree has its own branch and working files; remotes and Git configuration
are shared. Never develop two worktrees on the same branch. For a delegated T3 task,
use its supported worktree isolation mechanism rather than creating the child's
checkout manually.

Set up dependencies using the required Node/package-manager versions in
`package.json`. Run heavy jobs through the approved worker launcher and its current
resource policy. Use isolated fixtures, with automatic live-data seeding disabled.

Commit and push the feature branch from its worktree. Before pushing, run the
focused tests and `vp run check:changed origin/t3-mods`. This explicit base avoids
comparing personalized changes against upstream's moving main branch.

```sh
git push -u origin mods/my-change
```

Open a PR in **cbsimpson4242/t3code**, with **t3-mods** as its base.
After approval/merge, update the integration checkout with `git pull --ff-only`.
For an explicitly authorized direct integration, merge the feature branch into
`t3-mods`, validate the combined result, then push `origin t3-mods`.
Do not force-push the integration branch. Remove completed worktrees only after
their changes are safely merged and their working files are clean.

## Bringing in upstream updates

Fetch upstream without changing the personalized branch:

```sh
git fetch --no-tags upstream main
```

If the checkout is shallow, fetch its missing history first with
`git fetch --unshallow --no-tags upstream main`.
Create an update worktree/branch from `t3-mods`, merge the selected upstream
release or commit there, resolve conflicts, and verify the voice player and other
mods. Merge the tested result through a PR targeting `t3-mods`.
Do not reset `t3-mods` to upstream or use a force-sync operation that discards mods.

## Worker authentication

hermes-worker pushes directly using a repository-scoped SSH deploy key. Its private
key stays on that worker; Git configuration selects it for this repository and its
worktrees. GitHub host keys were obtained over verified HTTPS. No SSH agent
forwarding or copied personal GitHub tokens are required.
A newly provisioned worker needs its own authorized credential before pushing.
