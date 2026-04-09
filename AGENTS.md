---
alwaysApply: true
---

## Definition

- The app's name is unsigned char.
- It is a local-first desktop app built with Tauri and TypeScript.

## UI System

- Use coss ui as the default UI system and design reference for all frontend work: https://coss.com/ui/docs
- Prefer coss ui component patterns, naming, spacing, density, and interaction design over ad-hoc UI.
- If a screen needs a button, card, badge, input, empty state, keyboard hint, or similar primitive, first match the closest coss ui component or pattern before creating a custom treatment.
- Do not introduce another UI system unless explicitly requested.
- This repo does not currently use React or Tailwind. If the current stack blocks literal coss ui adoption, mirror coss ui structure and visual language in the existing implementation unless the task explicitly includes a framework migration.

## Commit Discipline

- Commit after every discrete action. Each meaningful change must be committed before moving on.
- Commit messages must use the intent as the title and a concise summary of what changed as the description/body.
- Do not batch unrelated changes into a single commit.
- Keep commits small and reviewable.

## Branching

- If the current branch is `main`, commit directly on `main`.
- If the current branch is `gitbutler/workspace` or starts with `gitbutler/workspace`, use GitButler and the But skill for branch management and commits.

## Comments

- By default, avoid writing comments.
- If you write one, it should explain why, not what.

## General

- Prefer simple, maintainable, production-friendly solutions.
- Do not overengineer or add heavy abstractions for small features.
- Keep APIs small, behavior explicit, and naming clear.
- Run `npm run build` after TypeScript or UI changes before committing.
