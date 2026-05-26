import type { WindowsDesktopWindowTarget } from "./types.js";

export interface TargetVerificationScore {
  score: number;
  status: "pass" | "confirm" | "block";
  differences: string[];
}

export function scoreWindowsTargetVerification(
  original: WindowsDesktopWindowTarget,
  current?: WindowsDesktopWindowTarget
): TargetVerificationScore {
  if (!current) {
    return { score: 0, status: "block", differences: ["Target window is unavailable."] };
  }

  let score = 0;
  const differences: string[] = [];

  if (original.hwnd === current.hwnd) {
    score += 30;
  } else {
    differences.push("Window handle changed.");
  }

  if (original.processId && current.processId && original.processId === current.processId) {
    score += 25;
  } else if (original.processId || current.processId) {
    differences.push("Process ID changed.");
  }

  if (original.executablePath && current.executablePath && normalize(original.executablePath) === normalize(current.executablePath)) {
    score += 25;
  } else if (original.executablePath || current.executablePath) {
    differences.push("Executable path changed.");
  }

  const titleSimilarity = stringSimilarity(original.title, current.title);
  if (titleSimilarity >= 0.9) {
    score += 20;
  } else if (titleSimilarity >= 0.65) {
    score += 10;
    differences.push("Window title partially changed.");
  } else {
    differences.push("Window title changed.");
  }

  if (score >= 80) {
    return { score, status: "pass", differences };
  }
  if (score >= 55) {
    return { score, status: "confirm", differences };
  }
  return { score, status: "block", differences };
}

export function stringSimilarity(left: string, right: string): number {
  const a = normalize(left);
  const b = normalize(right);
  if (a === b) {
    return 1;
  }
  if (!a || !b) {
    return 0;
  }

  const maxLength = Math.max(a.length, b.length);
  return (maxLength - levenshteinDistance(a, b)) / maxLength;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + cost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? 0;
}
