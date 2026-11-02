import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

export type CameraProblem = "cameraDenied" | "cameraError";

interface Props {
  open: boolean;
  onScan: (text: string) => void;
  onCameraProblem: (problem: CameraProblem) => void;
  onClose: () => void;
}

export function QrScanDialog({
  open,
  onScan,
  onCameraProblem,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onScan, onCameraProblem });
  useEffect(() => {
    callbacks.current = { onScan, onCameraProblem };
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | undefined;
    let frame = 0;
    let stopped = false;
    let decode: typeof import("jsqr").default;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true })!;

    function tick() {
      const video = videoRef.current;
      if (stopped || !video) return;
      if (video.readyState >= video.HAVE_ENOUGH_DATA) {
        const scale = Math.min(1, 480 / Math.max(video.videoWidth, 1));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = decode(image.data, image.width, image.height);
        if (code?.data) {
          stopped = true;
          callbacks.current.onScan(code.data);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    }

    Promise.all([
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      }),
      import("jsqr"),
    ])
      .then(([s, jsQR]) => {
        stream = s;
        decode = jsQR.default;
        if (stopped) return s.getTracks().forEach((track) => track.stop());
        const video = videoRef.current!;
        video.srcObject = s;
        video.play().catch(() => {});
        frame = requestAnimationFrame(tick);
      })
      .catch((err: unknown) => {
        if (stopped) return;
        callbacks.current.onCameraProblem(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "cameraDenied"
            : "cameraError",
        );
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="scan-dialog"
      aria-label={t("pair.scan")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && <video ref={videoRef} muted playsInline />}
      <div className="scan-overlay">
        <p className="scan-help">{t("pair.scanHelp")}</p>
        <div className="viewfinder" aria-hidden />
        <button type="button" className="button" onClick={onClose}>
          {t("pair.stopScan")}
        </button>
      </div>
    </dialog>
  );
}
