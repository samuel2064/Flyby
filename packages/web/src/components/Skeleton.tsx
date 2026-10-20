interface SkeletonProps {
  className?: string;
}

export function SkeletonCard({ className = "" }: SkeletonProps) {
  return (
    <div className={`bg-white rounded-lg shadow p-4 animate-pulse ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-gray-200 rounded w-1/3" />
          <div className="h-5 bg-gray-200 rounded w-2/3" />
        </div>
        <div className="text-right space-y-1">
          <div className="h-8 bg-gray-200 rounded w-20" />
          <div className="h-3 bg-gray-200 rounded w-16 ml-auto" />
        </div>
      </div>
      <div className="flex items-center justify-between mt-3">
        <div className="h-4 bg-gray-200 rounded w-24" />
        <div className="h-8 bg-gray-200 rounded w-24" />
      </div>
    </div>
  );
}

export function SkeletonText({ className = "" }: SkeletonProps) {
  return <div className={`h-4 bg-gray-200 rounded animate-pulse ${className}`} />;
}

export function SkeletonHeading({ className = "" }: SkeletonProps) {
  return <div className={`h-7 bg-gray-200 rounded animate-pulse ${className}`} />;
}

export function SkeletonButton({ className = "" }: SkeletonProps) {
  return <div className={`h-10 bg-gray-200 rounded-lg animate-pulse ${className}`} />;
}
