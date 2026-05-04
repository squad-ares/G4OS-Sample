---
'@g4os/release-channels': patch
---

Pack-review release-channels: `rolloutPercentAt` agora tolera schedule desordenada.

`parseRolloutSchedule` (Zod) aceita `RolloutEntry[]` sem enforce de ordem. A iteração anterior usava `if (entry.atHour <= elapsedHours) result = entry.percent;` — sobrescrevia a cada match, então:
- Schedule sorted ascending: funcionava por acidente.
- Schedule desordenada (operator-authored YAML, config remoto): retornava o `percent` do último entry da iteração, não o entry com `atHour` máximo que satisfaz a condição.

Fix: tracker `bestAtHour` em pass O(n) — pega sempre o entry com maior `atHour ≤ elapsedHours`. Sem necessidade de sort no caller.
