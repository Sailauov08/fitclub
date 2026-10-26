import { Skeleton } from '@/components/ui/display';

export default function AuthLoading() {
  return (
    <div role="status" aria-busy="true" className="mx-auto w-full max-w-sm space-y-4 py-10">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="mt-6 h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}
