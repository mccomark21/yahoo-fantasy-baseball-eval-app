# Issue tracker: GitHub

Issues and PRDs for this repository live as GitHub issues. Use the gh CLI for tracker operations.

## Repository

- Remote: https://github.com/mccomark21/yahoo-fantasy-baseball-eval-app
- Default repository context is inferred from git remote when running inside this clone.

## Conventions

- Create issue: gh issue create --title "..." --body "..."
- Read issue: gh issue view <number> --comments
- List issues: gh issue list --state open
- Comment: gh issue comment <number> --body "..."
- Add labels: gh issue edit <number> --add-label "label"
- Remove labels: gh issue edit <number> --remove-label "label"
- Close issue: gh issue close <number> --comment "..."

## Skill integration

When an engineering skill says publish to the issue tracker, create or update a GitHub issue in this repo.
