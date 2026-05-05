# Yahoo Fantasy Baseball Evaluation

This context defines the project language for evaluating hitter, pitcher, reliever, injured-pitcher, and prospect decisions inside Yahoo fantasy baseball leagues.

## Language

### League and roster context

**League**:
A named Yahoo competition whose teams and player availability define the decision pool.
_Avoid_: workspace, tenant

**Fantasy Team**:
A roster owner slot inside a league, including Free Agent as the unrostered pool.
_Avoid_: manager bucket, owner group

**Roster Focus**:
A filtered subset of fantasy teams used to narrow analysis to rostered or available players.
_Avoid_: shortlist filter, ownership mask

### Evaluation views

**Hitter View**:
The analysis mode for batter quality and volume-adjusted composite ranking.
_Avoid_: batter module, offense tab

**Pitcher View**:
The analysis mode for starting pitcher ranking movement and trend context.
_Avoid_: SP service, starter board

**Reliever View**:
The analysis mode for relief pitcher rankings tied to league scoring rules.
_Avoid_: bullpen mode, RP service

**Injured Pitcher View**:
The analysis mode for pitchers currently injured but expected to matter when healthy.
_Avoid_: IL board, stash mode

**Prospect View**:
The analysis mode for minor-league and prospect ranking consensus.
_Avoid_: farm service, dynasty board

### Ranking and trend concepts

**Time Window**:
The stat horizon selected for hitters or prospect stat summaries (for example STD, 30D, 14D, 7D).
_Avoid_: sample period, query span

**Relief Scoring Mode**:
The reliever ranking basis inferred from league context (svhld or saves).
_Avoid_: relief profile, RP format

**Trend Series**:
An ordered sequence of recent ranking positions used to show movement direction.
_Avoid_: sparkline payload, rank trace

**Prospect Consensus Rank**:
A blended prospect standing from MLB Pipeline, FanGraphs, and Prospects Live sources.
_Avoid_: aggregate score, merged index

## Relationships

- A **League** contains many **Fantasy Team** values.
- **Roster Focus** constrains players shown in each analysis **View**.
- **Hitter View** uses **Time Window** to compute current evaluation context.
- **Reliever View** uses **Relief Scoring Mode** to choose the correct ranking source.
- **Pitcher View** and **Reliever View** both surface a **Trend Series**.
- **Prospect View** presents **Prospect Consensus Rank** and source-specific rank context.

## Example dialogue

> **Dev:** "For this **League**, should **Reliever View** use svhld or saves?"
> **Domain expert:** "Infer **Relief Scoring Mode** from league naming rules, then show the matching source list so the **Trend Series** stays consistent."

## Flagged ambiguities

- "team" can refer to MLB team or fantasy roster team. In this project, **Fantasy Team** always means Yahoo roster ownership context.
- "window" can refer to query period or UI state. In this project, **Time Window** specifically means the user-selected stat horizon.
- "ranking" can mean latest source rank or blended prospect ordering. Use **Trend Series** for time movement and **Prospect Consensus Rank** for cross-source blending.
