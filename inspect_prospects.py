import pandas as pd

df = pd.read_parquet('https://raw.githubusercontent.com/mccomark21/pybaseball-data-hub/main/data/processed/prospects_snapshot.parquet')

print('PROSPECTS DATAFRAME HEADER')
print('=' * 120)
print(f'\nShape: {df.shape[0]} rows × {df.shape[1]} columns')

print('\nColumns:')
for i, col in enumerate(df.columns, 1):
    dtype = str(df[col].dtype)
    non_null = df[col].notna().sum()
    print(f'{i:2d}. {col:<40} {dtype:<15} ({non_null:3d} non-null)')

print('\n' + '=' * 120)
print('\nFirst 5 rows sample:')
print(df.head().to_string())
