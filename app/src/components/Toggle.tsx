interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: ToggleProps) {
  return (
    <label className="toggle-row">
      <span className="toggle-text">
        {label}
        {description && <span className="muted small">{description}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
