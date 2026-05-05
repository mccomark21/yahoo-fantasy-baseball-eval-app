# Domain docs

How engineering skills should consume repository domain docs.

## Before exploring

Read these in order when they exist:

1. CONTEXT.md at repository root
2. docs/adr/ entries relevant to the touched area

This repository is configured as a single-context layout.

## Structure

/
- CONTEXT.md
- docs/adr/
- src/

## Vocabulary rule

When describing refactors, hypotheses, or issue titles, use terms from CONTEXT.md and avoid introducing synonyms for defined terms.

## ADR conflicts

If a proposed change conflicts with an ADR, call out the conflict explicitly and explain why reopening the ADR is or is not warranted.
