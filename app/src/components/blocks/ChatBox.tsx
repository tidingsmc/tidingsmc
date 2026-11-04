import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Clock, Send, User } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import { Avatar } from "../Avatar";
import {
  CHAT_VALUE,
  chatTime,
  list,
  readParams,
  splitMentions,
  text,
  type ChatBlock,
} from "../../lib/addons";
import type { BlockContext } from "./context";

function useChatOption(
  key: string,
  initial: boolean,
): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? initial : saved === "on";
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (on: boolean) => {
      try {
        localStorage.setItem(key, on ? "on" : "off");
      } catch {
        // Remembered until the page is closed only
      }
      setOn(on);
    },
    [key],
  );
  return [on, set];
}

// Like Minecraft's chat
export function ChatBox({
  block,
  context,
}: {
  block: ChatBlock;
  context: BlockContext;
}) {
  const { t } = useTranslation();

  const [value, setValue] = useState("");
  const [timesShown, setTimesShown] = useChatOption("tidings.chatTimes", true);
  const [heads, setHeads] = useChatOption("tidings.chatHeads", false);

  const scroller = useRef<HTMLOListElement>(null);
  const atBottom = useRef(true);
  const lines = list(block.lines).filter((l) => typeof l.text === "string");
  const last = lines.length ? JSON.stringify(lines[lines.length - 1]) : "";

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [lines.length, last]);

  const params = readParams(block.params);
  const action =
    typeof block.action === "string" && params !== null ? block.action : null;
  const empty = text(block.empty);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!action || !value.trim()) return;
    atBottom.current = true;
    await context.run({
      action,
      params: params ?? {},
      values: { [CHAT_VALUE]: value },
    });
  }

  return (
    <>
      <div className="mc-chat-tools">
        <button
          type="button"
          className="mc-button mc-toggle"
          aria-pressed={timesShown}
          aria-label={t("addon.chatTimes")}
          title={t("addon.chatTimes")}
          onClick={() => setTimesShown(!timesShown)}
        >
          <Clock aria-hidden />
        </button>
        <button
          type="button"
          className="mc-button mc-toggle"
          aria-pressed={heads}
          aria-label={t("addon.chatHeads")}
          title={t("addon.chatHeads")}
          onClick={() => setHeads(!heads)}
        >
          <User aria-hidden />
        </button>
      </div>
      <div className="mc-chat">
        {lines.length === 0 ? (
          <p className="mc-chat-empty">{empty}</p>
        ) : (
          <ol
            ref={scroller}
            className="mc-chat-lines"
            role="log"
            onScroll={(e) => {
              const el = e.currentTarget;
              atBottom.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 8;
            }}
          >
            {lines.map((line, i) => {
              const name = text(line.name);
              const tag = text(line.tag);
              const time = timesShown ? chatTime(line.time) : "";
              const player = line.player;
              const face =
                heads && name && typeof player?.name === "string" ? (
                  <span className="mc-head">
                    <Avatar
                      name={player.name}
                      skinUrl={text(player.skinUrl)}
                      size={18}
                    />
                    <span className="visually-hidden">{name}</span>
                  </span>
                ) : null;
              return (
                <li
                  key={i}
                  className={
                    !name
                      ? "mc-system"
                      : line.whisper === true
                        ? "mc-whisper"
                        : undefined
                  }
                >
                  {time && <span className="mc-chat-time">{time} </span>}
                  {tag && <span className="mc-gray">[{tag}] </span>}
                  {face ? <>{face} </> : name && <>&lt;{name}&gt; </>}
                  {splitMentions(line.text).map((part, j) =>
                    part.mention ? (
                      <span key={j} className="mc-yellow">
                        {part.text}
                      </span>
                    ) : (
                      <Fragment key={j}>{part.text}</Fragment>
                    ),
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {action && (
          <form className="mc-chat-input" onSubmit={submit}>
            <input
              value={value}
              placeholder={text(block.placeholder)}
              maxLength={Number(block.maxLength) || undefined}
              aria-label={t("addon.chatMessage")}
              enterKeyHint="send"
              onChange={(e) => setValue(e.target.value)}
            />
            <button
              type="submit"
              className="mc-button"
              disabled={context.busy || !value.trim()}
              aria-label={t("addon.chatSend")}
              title={t("addon.chatSend")}
            >
              <Send aria-hidden />
            </button>
          </form>
        )}
      </div>
    </>
  );
}
