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

export function createCameraScanGate(rearmMs = 850) {
  let lastCode = '';
  let lastSeenAt = 0;
  return (code: string, now: number) => {
    const seenRecently = lastCode === code && now - lastSeenAt < rearmMs;
    lastCode = code;
    lastSeenAt = now;
    return !seenRecently;
  };
}
