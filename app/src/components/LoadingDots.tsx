export function LoadingDots({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  return (
    <span
      className={compact ? "loading-dots compact" : "loading-dots"}
      role="status"
      aria-label={label}
    >
      <span aria-hidden />
      <span aria-hidden />
      <span aria-hidden />
    </span>
  );
}
