export type ViewMode = 'hitters' | 'pitchers' | 'relievers' | 'injured' | 'prospects';

interface RunAsyncTaskOptions<T> {
  task: () => Promise<T>;
  onSuccess: (value: T) => void;
  onError?: () => void;
}

type AsyncTaskRunner = <T>(options: RunAsyncTaskOptions<T>) => Promise<void>;

interface RunManagedViewQueryArgs<T> {
  isReady: boolean;
  runTask: AsyncTaskRunner;
  task: () => Promise<T>;
  onSuccess: (value: T) => void;
  onError: () => void;
}

export async function runManagedViewQuery<T>({
  isReady,
  runTask,
  task,
  onSuccess,
  onError,
}: RunManagedViewQueryArgs<T>): Promise<void> {
  if (!isReady) return;

  await runTask({
    task,
    onSuccess,
    onError,
  });
}

interface ScheduleActiveViewQueryArgs {
  viewMode: ViewMode;
  runByView: Record<ViewMode, () => Promise<void>>;
  delayMs?: number;
}

export function scheduleActiveViewQuery({
  viewMode,
  runByView,
  delayMs = 100,
}: ScheduleActiveViewQueryArgs): () => void {
  const timer = window.setTimeout(() => {
    void runByView[viewMode]();
  }, delayMs);

  return () => {
    window.clearTimeout(timer);
  };
}
