/** Shown instantly while a tab's data loads, so taps feel immediate on slow networks. */
export default function AdminLoading() {
  return (
    <div className="grid grid-cols-1 gap-4" aria-busy="true" aria-label="Loading">
      <div className="bg-muted h-8 w-40 animate-pulse rounded-lg" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-muted h-20 animate-pulse rounded-xl" />
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="bg-muted h-16 animate-pulse rounded-xl" />
      ))}
    </div>
  );
}
