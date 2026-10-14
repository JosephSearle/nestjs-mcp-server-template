<!--
Title: Conventional Commits, imperative mood.
  feat(auth): validate token audience against the resource URL
For an intent.md or spec.md PR, use the SDLC doc template instead:
  add ?template=sdlc-doc.md to the compare URL.
-->

## Summary

<!-- One line. What this change does, imperative mood. -->

## Why

<!-- The problem this solves and why now. What breaks or stays broken if this doesn't merge. -->

## Linked issue

<!-- "Closes #<number>" closes the issue on merge to main. Use "Refs #<number>" if this only partly addresses it. -->

Closes #

## Approach

<!-- How it works, and the alternatives you rejected and why. Skip for trivial changes. -->

## Testing

- [ ] Unit tests added or updated
- [ ] Inspector CLI smoke tests pass (`tools/list`, affected `tools/call`)
- [ ] Checked manually in the MCP Inspector

Transports exercised:

- [ ] Streamable HTTP
- [ ] stdio

<!-- Anything you couldn't test, and why. -->

## Impact

Answer each one. Explain any "yes" below.

- Touches auth, token handling or rate limiting: **yes / no**
- Changes public config, environment variables, exported APIs or the gateway contract: **yes / no**
- Breaking for servers built from the template: **yes / no**
- Adds or upgrades a dependency: **yes / no**
- Needs a release note: **yes / no**

<!-- Details for each "yes". For breaking changes, include the migration steps. -->

## Checklist

- [ ] No secrets, tokens or internal hostnames in the diff, logs or test fixtures
- [ ] Docs updated (README, docs/, code comments meant for readers)
