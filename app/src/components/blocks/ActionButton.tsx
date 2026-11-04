import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../ConfirmDialog";
import { readLink, readParams, text, type ButtonBlock } from "../../lib/addons";
import type { BlockContext } from "./context";

function buttonClass(style: unknown) {
  return style === "primary" || style === "danger"
    ? `button ${style}`
    : "button";
}

export function ActionButton({
  block,
  context,
}: {
  block: ButtonBlock;
  context: BlockContext;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const label = text(block.label);
  const link = readLink(block.link);
  if (link) {
    return (
      <a className={buttonClass(block.style)} href={context.href(link)}>
        {label}
      </a>
    );
  }
  const params = readParams(block.params);
  if (typeof block.action !== "string" || params === null) return null;
  const action = { action: block.action, params };
  const confirm = text(block.confirm);
  return (
    <>
      <button
        type="button"
        className={buttonClass(block.style)}
        disabled={context.busy}
        onClick={() => (confirm ? setConfirming(true) : context.run(action))}
      >
        {label}
      </button>
      {confirm && (
        <ConfirmDialog
          open={confirming}
          title={label}
          message={confirm}
          confirmLabel={label || t("common.ok")}
          danger={block.style === "danger"}
          onConfirm={() => {
            setConfirming(false);
            context.run(action);
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
