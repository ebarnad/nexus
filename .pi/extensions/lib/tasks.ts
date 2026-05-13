import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MAX_LINES = 8;

export type TaskItem = {
  lineIndex: number;
  display: string;
  done: boolean;
};

export type TaskCategory = {
  name: string;
  tasks: TaskItem[];
};

export type TaskBoard = {
  categories: TaskCategory[];
  totalCount: number;
  error?: string;
};

function cleanTaskText(line: string): string {
  return line
    .replace(/^\s*- \[[ xX]\]\s*/, "")
    .replace(/_\(added \d{4}-\d{2}-\d{2}\)_/g, "")
    .replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/g, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/~~/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+-\s+$/, "")
    .trim();
}

export function readTaskCategories(cwd: string): TaskBoard {
  const tasksPath = join(cwd, "TASKS.md");
  if (!existsSync(tasksPath)) return { categories: [], totalCount: 0, error: "TASKS.md not found" };

  const content = readFileSync(tasksPath, "utf8");
  const allLines = content.split(/\r?\n/);
  const totalCount = allLines.filter((line) => /^\s*- \[[ xX]\]\s+/.test(line)).length;
  const categories: TaskCategory[] = [];
  let current: TaskCategory | undefined;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i] ?? "";
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = { name: heading[1]!, tasks: [] };
      categories.push(current);
      continue;
    }

    const task = line.match(/^(\s*)- \[([ xX])\]\s+(.+)$/);
    if (task && current) {
      const indent = (task[1] ?? "").length > 0 ? "  " : "";
      const done = String(task[2]).toLowerCase() === "x";
      current.tasks.push({ lineIndex: i, display: `${indent}${done ? "☑" : "☐"} ${cleanTaskText(line)}`, done });
    }
  }

  if (categories.length === 0) return { categories: [], totalCount, error: "No task sections found" };
  return { categories, totalCount };
}

function readTaskItemLines(cwd: string): { tasks: TaskItem[]; totalCount: number; error?: string } {
  const result = readTaskCategories(cwd);
  const active = result.categories.find((category) => category.name.toLowerCase() === "active");
  return {
    tasks: (active?.tasks ?? []).filter((task) => !task.done),
    totalCount: result.totalCount,
    error: result.error ?? (active ? undefined : "No ## Active section found"),
  };
}

function findSectionHeadingIndex(lines: string[], sectionName: string): number {
  return lines.findIndex((line) => /^##\s+/.test(line) && line.trim().toLowerCase() === `## ${sectionName.toLowerCase()}`);
}

function getTaskBody(line: string): string {
  const doneMatch = line.match(/^\s*- \[[xX]\]\s+~~(.+?)~~(?:\s*\(\d{4}-\d{2}-\d{2}\))?\s*$/);
  if (doneMatch) return doneMatch[1]!.trim();

  const openMatch = line.match(/^\s*- \[ \]\s+(.+)$/);
  if (openMatch) return openMatch[1]!.trim();

  return line.replace(/^\s*- \[[ xX]\]\s+/, "").trim();
}

function buildTaskLine(body: string, done: boolean, indent = ""): string {
  if (!done) return `${indent}- [ ] ${body}`;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `${indent}- [x] ~~${body}~~ (${today})`;
}

function getTaskLineState(line: string): { indent: string; done: boolean } | undefined {
  const match = line.match(/^(\s*)- \[([ xX])\]\s+/);
  if (!match) return undefined;
  return { indent: match[1] ?? "", done: String(match[2]).toLowerCase() === "x" };
}

function findMainTaskIndex(lines: string[], lineIndex: number): number | undefined {
  const task = getTaskLineState(lines[lineIndex] ?? "");
  if (!task || task.indent.length === 0) return undefined;

  for (let i = lineIndex - 1; i >= 0; i--) {
    const line = lines[i] ?? "";
    if (/^##\s+/.test(line)) break;

    const candidate = getTaskLineState(line);
    if (candidate && candidate.indent.length === 0) return i;
  }

  return undefined;
}

function findTaskBlockEnd(lines: string[], startIndex: number): number {
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^##\s+/.test(line)) return i;

    const task = getTaskLineState(line);
    if (task && task.indent.length === 0) return i;
  }

  return lines.length;
}

function shouldKeepSubtaskInCurrentSection(lines: string[], lineIndex: number, changes: Map<number, boolean>): boolean {
  const task = getTaskLineState(lines[lineIndex] ?? "");
  if (!task || task.indent.length === 0) return false;

  const mainTaskIndex = findMainTaskIndex(lines, lineIndex);
  if (mainTaskIndex === undefined) return false;

  const mainTask = getTaskLineState(lines[mainTaskIndex] ?? "");
  if (!mainTask) return false;

  const mainTaskDone = changes.get(mainTaskIndex) ?? mainTask.done;
  return !mainTaskDone;
}

export function previewTaskDoneState(result: TaskBoard, lineIndex: number, done: boolean): TaskBoard {
  const next: TaskBoard = {
    categories: result.categories.map((category) => ({
      name: category.name,
      tasks: category.tasks.map((task) => ({ ...task })),
    })),
    totalCount: result.totalCount,
    error: result.error,
  };

  const category = next.categories.find((current) => current.tasks.some((task) => task.lineIndex === lineIndex));
  if (!category) return result;

  const taskIndex = category.tasks.findIndex((task) => task.lineIndex === lineIndex);
  if (taskIndex < 0) return result;
  const task = category.tasks[taskIndex]!;
  if (task.done === done) return result;

  task.done = done;
  task.display = task.display.replace(/^(\s*)[☑☐]\s+/, (_match, indent) => `${indent}${done ? "☑" : "☐"} `);

  if (done && !task.display.startsWith("  ")) {
    for (let i = taskIndex + 1; i < category.tasks.length; i++) {
      const child = category.tasks[i]!;
      if (!child.display.startsWith("  ")) break;
      child.done = true;
      child.display = child.display.replace(/^(\s*)[☑☐]\s+/, (_match, indent) => `${indent}☑ `);
    }
  }

  return next;
}

export function applyTaskDoneChanges(cwd: string, changes: Map<number, boolean>): TaskBoard {
  const tasksPath = join(cwd, "TASKS.md");
  if (!existsSync(tasksPath)) return { categories: [], totalCount: 0, error: "TASKS.md not found" };

  const content = readFileSync(tasksPath, "utf8");
  const originalLines = content.split(/\r?\n/);
  const moves = [...changes.entries()]
    .map(([lineIndex, done]) => ({ lineIndex, done, line: originalLines[lineIndex] }))
    .filter((move): move is { lineIndex: number; done: boolean; line: string } => {
      if (move.line === undefined) return false;
      const isDoneLine = /^\s*- \[[xX]\]\s+/.test(move.line);
      return move.done !== isDoneLine;
    });

  const inPlaceChanges: Array<{ lineIndex: number; done: boolean; line: string }> = [];
  const relocations: Array<{ startIndex: number; deleteCount: number; done: boolean; lines: string[] }> = [];
  const relocatedLineIndexes = new Set<number>();

  for (const move of moves) {
    const state = getTaskLineState(move.line);
    if (!state || state.indent.length > 0) continue;

    const blockEnd = findTaskBlockEnd(originalLines, move.lineIndex);
    const blockLines = originalLines.slice(move.lineIndex, blockEnd).map((line, offset) => {
      const sourceLineIndex = move.lineIndex + offset;
      const task = getTaskLineState(line);
      if (!task) return line;

      const explicitDone = changes.get(sourceLineIndex);
      const nextDone = sourceLineIndex === move.lineIndex
        ? move.done
        : move.done
          ? true
          : explicitDone ?? task.done;

      if (sourceLineIndex !== move.lineIndex && explicitDone === undefined && nextDone === task.done) return line;
      return buildTaskLine(getTaskBody(line), nextDone, task.indent);
    });

    relocations.push({
      startIndex: move.lineIndex,
      deleteCount: blockEnd - move.lineIndex,
      done: move.done,
      lines: blockLines,
    });

    for (let i = move.lineIndex; i < blockEnd; i++) relocatedLineIndexes.add(i);
  }

  for (const move of moves) {
    if (relocatedLineIndexes.has(move.lineIndex)) continue;

    if (shouldKeepSubtaskInCurrentSection(originalLines, move.lineIndex, changes)) {
      inPlaceChanges.push(move);
      continue;
    }

    const indent = move.line.match(/^(\s*)/)?.[1] ?? "";
    relocations.push({
      startIndex: move.lineIndex,
      deleteCount: 1,
      done: move.done,
      lines: [buildTaskLine(getTaskBody(move.line), move.done, indent)],
    });
  }

  let lines = [...originalLines];
  for (const move of inPlaceChanges) {
    const indent = move.line.match(/^(\s*)/)?.[1] ?? "";
    lines[move.lineIndex] = buildTaskLine(getTaskBody(move.line), move.done, indent);
  }

  for (const relocation of [...relocations].sort((a, b) => b.startIndex - a.startIndex)) {
    lines.splice(relocation.startIndex, relocation.deleteCount);
  }

  for (const relocation of [...relocations].sort((a, b) => b.startIndex - a.startIndex)) {
    const destinationSection = relocation.done ? "Done" : "Active";
    const headingIndex = findSectionHeadingIndex(lines, destinationSection);
    if (headingIndex < 0) continue;
    lines.splice(headingIndex + 1, 0, ...relocation.lines);
  }

  writeFileSync(tasksPath, lines.join("\n"), "utf8");
  return readTaskCategories(cwd);
}

export function readTaskItems(cwd: string): { lines: string[]; omitted: number; activeCount: number; totalCount: number; error?: string } {
  const result = readTaskItemLines(cwd);
  return {
    lines: result.tasks.map((task) => task.display).slice(0, MAX_LINES),
    omitted: Math.max(0, result.tasks.length - MAX_LINES),
    activeCount: result.tasks.length,
    totalCount: result.totalCount,
    error: result.error,
  };
}

