# GitHub Issue Drafts

These files are intended to be used as the source of truth for public GitHub issues.

They exist for two reasons:

1. keep architectural and governance rationale versioned in the repo
2. let maintainers create matching GitHub issues with `gh issue create -F <file>`

Recommended workflow:

```bash
gh issue create --title "<issue title>" --body-file docs/github-issues/<file>.md
```

The draft files are grouped to match the intended commit slices for this repo so that
public issue history and git history stay aligned.
