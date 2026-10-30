import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "pixelarticons/react";
import { useTranslation } from "react-i18next";

interface DropdownOption<T extends string> {
  value: T;
  label: string;
  lang?: string;
}

interface DropdownProps<T extends string> {
  label: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
}

export function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
}: DropdownProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function show() {
    setActive(selected);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  function choose(i: number) {
    onChange(options[i].value);
    close();
  }

  function onListKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        setActive((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        setActive(0);
        break;
      case "End":
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        choose(active);
        break;
      case "Escape":
        close();
        break;
      case "Tab":
        setOpen(false);
        return;
      default:
        return;
    }
    e.preventDefault();
  }

  return (
    <div className="dropdown" ref={root}>
      <button
        ref={button}
        type="button"
        className="button dropdown-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={t("common.labelValue", {
          label,
          value: options[selected].label,
        })}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className="dropdown-values">
          {options.map((option, i) => (
            <span key={option.value} lang={option.lang} hidden={i !== selected}>
              {option.label}
            </span>
          ))}
        </span>
        <ChevronDown className="dropdown-chevron" aria-hidden />
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          className="dropdown-menu"
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
        >
          {options.map((option, i) => (
            <li
              key={option.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === selected}
              lang={option.lang}
              className={
                i === active ? "dropdown-option active" : "dropdown-option"
              }
              onPointerMove={() => setActive(i)}
              onClick={() => choose(i)}
            >
              {option.label}
              {/* Kept in place when hidden, so labels line up. */}
              <Check
                aria-hidden
                style={{ visibility: i === selected ? "visible" : "hidden" }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
