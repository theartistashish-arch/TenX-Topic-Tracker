# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Artifacts

- **TenX** (`artifacts/tenx`) — Expo mobile app for competitive exam aspirants (UPSC, NEET, JEE, etc.). Login/Signup with Name, City, School, and Exam Goal. Bottom tabs: Home, Library, Pulse. Home shows streak, due topics, and a "New topic" CTA. A top-left menu opens Profile and Settings. Profile shows avatar/initials, stats (streak, weekly hours, sessions, totals) and inline editing for name/city/school/exam goal. Settings personalize daily target, focus block, break length, weekly goal, auto-start break, pause warning, haptics, sound, daily reminder, theme preference, plus Reset Settings and Delete All Topics. Focus screen reads default focus/break minutes from Settings and respects haptics/sound toggles. Auth, topics, and settings are persisted locally with AsyncStorage. No backend.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Mobile**: Expo (React Native), expo-router, AsyncStorage for persistence
- **API framework**: Express 5 (unused by TenX)
- **Database**: PostgreSQL + Drizzle ORM (unused by TenX)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

See the `pnpm-workspace` skill for workspace structure.
