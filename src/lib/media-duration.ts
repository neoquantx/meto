export function readMediaDuration(file: Blob) {
  return new Promise<number>((resolve, reject) => {
    const element = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
    const url = URL.createObjectURL(file);
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      element.removeAttribute("src");
      element.load();
      fn();
    };

    const fail = () => finish(() => reject(new Error("Could not read the length of this file.")));
    const timer = window.setTimeout(fail, 8000);

    element.preload = "metadata";
    element.onerror = fail;
    element.onloadedmetadata = () => {
      if (Number.isFinite(element.duration) && element.duration > 0) {
        finish(() => resolve(element.duration));
        return;
      }
      element.ontimeupdate = () => {
        element.ontimeupdate = null;
        const duration = element.duration;
        if (Number.isFinite(duration) && duration > 0 && duration < 1e7) {
          finish(() => resolve(duration));
        } else {
          fail();
        }
      };
      try {
        element.currentTime = 1e101;
      } catch {
        fail();
      }
    };
    element.src = url;
  });
}

export async function durationForRecording(blob: Blob, recordedMs: number) {
  try {
    const probed = await readMediaDuration(blob);
    if (probed >= 1) return probed;
  } catch {
    // WebM metadata is often missing; fall through to the timer, then the bitrate.
  }
  if (recordedMs >= 1000) return recordedMs / 1000;
  return blob.size / 4000;
}
