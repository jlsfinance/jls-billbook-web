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

export function createCameraScanGate(rearmMs = 450) {
  const lastSeen = new Map<string, number>();
  return (code: string, now: number) => {
    for (const [seen, time] of lastSeen) {
      if (now - time >= rearmMs) lastSeen.delete(seen);
    }
    const seenRecently = lastSeen.has(code);
    lastSeen.set(code, now);
    return !seenRecently;
  };
}
