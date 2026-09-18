# Workflow: weekly maths probe
trigger: Sunday evening, or "run maths probe" typed at the Desk
context: learning/maths/map.md, schedule/week.md
steps:
  1. claude — read learning/maths/map.md, pick the three weakest claims that are "practised", and write three probe questions (one per claim, no hints) to inbox/probe-<date>.md
  2. me — answer them on paper, then type the answers into the same file under each question
  3. codex — mark the answers against the map, update the three rows in learning/maths/map.md (status and last evidence), and write the run report
done when: the three rows carry today's date in "Last evidence"
