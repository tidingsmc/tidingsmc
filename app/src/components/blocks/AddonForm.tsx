import { useState, type FormEvent } from "react";
import { Dropdown } from "../Dropdown";
import { Toggle } from "../Toggle";
import {
  list,
  readParams,
  text,
  type Field,
  type FormBlock,
} from "../../lib/addons";
import type { BlockContext } from "./context";

function initialValues(fields: Field[]): Record<string, string> {
  return Object.fromEntries(
    fields.map((f) => [
      f.name,
      f.type === "toggle" ? String(f.value === true) : text(f.value),
    ]),
  );
}

export function AddonForm({
  block,
  context,
}: {
  block: FormBlock;
  context: BlockContext;
}) {
  const fields = list(block.fields).filter(
    (f) =>
      typeof f.name === "string" &&
      (f.type === "text" || f.type === "toggle" || f.type === "select"),
  );
  const [values, setValues] = useState(() => initialValues(fields));
  const params = readParams(block.params);
  if (typeof block.action !== "string" || params === null) return null;
  const action = block.action;
  const formParams = params;
  const set = (name: string, value: string) =>
    setValues((v) => ({ ...v, [name]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    await context.run({ action, params: formParams, values });
  }

  return (
    <form className="form addon-form" onSubmit={submit}>
      {fields.map((field) => {
        const label = text(field.label);
        switch (field.type) {
          case "text":
            return (
              <label key={field.name} className="field">
                {label}
                <input
                  value={values[field.name] ?? ""}
                  placeholder={text(field.placeholder)}
                  maxLength={Number(field.maxLength) || undefined}
                  onChange={(e) => set(field.name, e.target.value)}
                />
              </label>
            );
          case "toggle":
            return (
              <Toggle
                key={field.name}
                label={label}
                checked={values[field.name] === "true"}
                onChange={(checked) => set(field.name, String(checked))}
              />
            );
          case "select":
            return (
              <div key={field.name} className="field">
                {label}
                <Dropdown
                  label={label}
                  value={values[field.name] ?? ""}
                  options={list(field.options).map((o) => ({
                    value: text(o.value),
                    label: text(o.label),
                  }))}
                  onChange={(value) => set(field.name, value)}
                />
              </div>
            );
        }
      })}
      <button type="submit" className="button primary" disabled={context.busy}>
        {text(block.submit)}
      </button>
    </form>
  );
}
