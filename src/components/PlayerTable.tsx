import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { PlayerRow } from '@/lib/queries';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

const Z_SCORE_COLUMNS = new Set(['z_xwoba', 'z_pull_air_pct', 'z_bb_k', 'z_sb_per_pa']);

function getZScoreBgClass(value: number | null): string {
  if (value == null) return '';
  if (value <= -1.5) return 'bg-red-200 dark:bg-red-900/50';
  if (value <= -0.5) return 'bg-red-100 dark:bg-red-950/40';
  if (value < 0.5) return '';
  if (value < 1.5) return 'bg-green-100 dark:bg-green-950/40';
  return 'bg-green-200 dark:bg-green-900/50';
}

const columns: ColumnDef<PlayerRow>[] = [
  {
    accessorKey: 'player_name',
    header: 'Player',
    cell: ({ getValue }) => (
      <span className="font-medium">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'mlb_team',
    header: 'Team',
  },
  {
    accessorKey: 'position',
    header: 'Position',
  },
  {
    accessorKey: 'fantasy_team',
    header: 'Fantasy Team',
  },
  {
    accessorKey: 'pa',
    header: 'PA',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v : '—';
    },
  },
  {
    accessorKey: 'bbe',
    header: 'BBE',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v : '—';
    },
  },
  {
    accessorKey: 'xwoba',
    header: 'xwOBA',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v.toFixed(3) : '—';
    },
  },
  {
    accessorKey: 'pull_air_pct',
    header: 'Pull Air%',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? `${v.toFixed(1)}%` : '—';
    },
  },
  {
    accessorKey: 'bb_k',
    header: 'BB:K',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v.toFixed(2) : '—';
    },
  },
  {
    accessorKey: 'sb_per_pa',
    header: 'SB/PA',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v.toFixed(3) : '—';
    },
  },
  {
    accessorKey: 'z_xwoba',
    header: 'xwOBA Z',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v.toFixed(2) : '—';
    },
  },
  {
    accessorKey: 'z_pull_air_pct',
    header: 'Pull% Z',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v.toFixed(2) : '—';
    },
  },
  {
    accessorKey: 'z_bb_k',
    header: 'BB:K Z',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v.toFixed(2) : '—';
    },
  },
  {
    accessorKey: 'z_sb_per_pa',
    header: 'SB/PA Z',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v.toFixed(2) : '—';
    },
  },
  {
    accessorKey: 'composite_score',
    header: 'Composite',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v.toFixed(2) : '—';
    },
  },
];

interface PlayerTableProps {
  data: PlayerRow[];
  isLoading: boolean;
}

export function PlayerTable({ data, isLoading }: PlayerTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'composite_score', desc: true },
  ]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        Loading data...
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="overflow-auto flex-1">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {header.column.getIsSorted() === 'asc' ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                      ) : header.column.getIsSorted() === 'desc' ? (
                        <ArrowDown className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={`whitespace-nowrap ${Z_SCORE_COLUMNS.has(cell.column.id) ? getZScoreBgClass(cell.getValue<number | null>()) : ''}`}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="border-t px-4 py-2 text-sm text-muted-foreground">
        Showing {table.getRowModel().rows.length} players
      </div>
    </div>
  );
}
