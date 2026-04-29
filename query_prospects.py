import pandas as pd

# Load the prospects data
url = 'https://raw.githubusercontent.com/mccomark21/pybaseball-data-hub/main/data/processed/prospects_snapshot.parquet'
df = pd.read_parquet(url)

print("\n" + "=" * 140)
print("PROSPECTS DATA REVIEW")
print("=" * 140)

# Basic info
print(f"\nDataset Shape: {df.shape[0]} rows × {df.shape[1]} columns")

# Top prospects by ranking
print("\n--- TOP 10 PROSPECTS BY BEST_RANK ---")
top_10 = df.nsmallest(10, 'best_rank')[['player_name', 'org', 'level', 'age', 'best_rank', 'avg_rank', 'positions', 'fv']].drop_duplicates(subset=['player_name', 'org'])
print(top_10.to_string(index=False))

# Stats coverage
print("\n--- STATS COVERAGE BY POSITION ---")
hitter_stats = ['atBats', 'avg', 'homeRuns', 'rbi', 'runs', 'stolenBases', 'strikeOuts', 'ops']
pitcher_stats = ['inningsPitched', 'era', 'whip', 'strikeoutsPer9Inn', 'walksPer9Inn', 'wins', 'saves', 'holds']

print("\nHitter Stats Present:")
for stat in hitter_stats[:4]:
    non_null = df[stat].notna().sum()
    pct = (non_null / len(df)) * 100
    print(f"  {stat:<20} {non_null:3d} rows ({pct:5.1f}%)")

print("\nPitcher Stats Present:")
for stat in pitcher_stats[:4]:
    non_null = df[stat].notna().sum()
    pct = (non_null / len(df)) * 100
    print(f"  {stat:<20} {non_null:3d} rows ({pct:5.1f}%)")

# Sample players with stats
print("\n--- SAMPLE HITTERS WITH ADVANCED STATS ---")
hitters_with_stats = df[df['atBats'].notna()][['player_name', 'org', 'level', 'atBats', 'avg', 'homeRuns', 'rbi', 'ops', 'stats_summary']].drop_duplicates(subset=['player_name', 'org']).head(5)
for idx, row in hitters_with_stats.iterrows():
    print(f"\n{row['player_name']} ({row['org']}) - {row['level']}")
    print(f"  Stats: {row['atBats']:.0f} AB, .{str(row['avg']).split('.')[-1][:3]}, {row['homeRuns']:.0f} HR, {row['rbi']:.0f} RBI, OPS: {row['ops']}")
    if pd.notna(row['stats_summary']) and row['stats_summary']:
        summary = row['stats_summary'][:120]
        print(f"  Summary: {summary}...")

print("\n--- SAMPLE PITCHERS WITH ADVANCED STATS ---")
pitchers_with_stats = df[df['inningsPitched'].notna()][['player_name', 'org', 'level', 'inningsPitched', 'era', 'strikeoutsPer9Inn', 'whip', 'stats_summary']].drop_duplicates(subset=['player_name', 'org']).head(5)
for idx, row in pitchers_with_stats.iterrows():
    print(f"\n{row['player_name']} ({row['org']}) - {row['level']}")
    print(f"  Stats: {row['inningsPitched']} IP, ERA: {row['era']}, K/9: {row['strikeoutsPer9Inn']}, WHIP: {row['whip']}")
    if pd.notna(row['stats_summary']) and row['stats_summary']:
        summary = row['stats_summary'][:120]
        print(f"  Summary: {summary}...")

# Ranking source comparison
print("\n--- RANKING SOURCE COMPARISON ---")
print(f"\nProspects with MLB rank: {df['mlb_rank'].notna().sum()} ({(df['mlb_rank'].notna().sum()/len(df)*100):.1f}%)")
print(f"Prospects with Fangraphs rank: {df['fangraphs_rank'].notna().sum()} ({(df['fangraphs_rank'].notna().sum()/len(df)*100):.1f}%)")
print(f"Unique player+org combos: {df.drop_duplicates(subset=['player_name', 'org']).shape[0]}")

# Data freshness
print("\n--- DATA FRESHNESS ---")
print(f"Latest collection: {df['collected_at'].max()}")
print(f"Payload scraped: {df['payload_scraped_at'].unique()}")

print("\n" + "=" * 140 + "\n")
