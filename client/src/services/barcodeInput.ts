export type BarcodeBurst = { value: string; lastAt: number; characters: number };

export function recordBarcodeInput(previous: BarcodeBurst, value: string, now: number, inputType: string): BarcodeBurst {
  const appended = inputType === 'insertText' && value.length === previous.value.length + 1 && value.startsWith(previous.value);
  return {
    value,
    lastAt: now,
    characters: appended ? (now - previous.lastAt <= 35 ? previous.characters + 1 : 1) : 0,
  };
}

export function isScannerBurst(input: BarcodeBurst) {
  return input.characters >= 4 && input.characters === input.value.length;
}

export function createCameraScanGate(rearmMs = 380) {
  const locked = new Map<string, number | null>();
  let previousFrameAt: number | undefined;

  return (code: string | null, now: number) => {
    // A stalled or backgrounded camera gives no evidence that a label moved away.
    const interrupted = previousFrameAt !== undefined && now - previousFrameAt > 350;
    previousFrameAt = now;

    for (const [seen, missingSince] of locked) {
      if (seen === code) continue;
      const absenceStart = interrupted ? now : (missingSince ?? now);
      if (now - absenceStart >= rearmMs) locked.delete(seen);
      else locked.set(seen, absenceStart);
    }

    if (!code) return false;
    const missingSince = interrupted ? null : locked.get(code);
    const accept = !locked.has(code) || (missingSince != null && now - missingSince >= rearmMs);
    locked.set(code, null);
    return accept;
  };
}
