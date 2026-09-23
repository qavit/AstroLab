/** Canvas interaction modes. "select" is the resting mode; the others are one-shot tools. */
export type ToolMode = "select" | "add-source" | "delete-source";

/**
 * Single-letter shortcuts: neither is a browser default, and both are ignored while a text
 * field has focus. They are surfaced in the tool buttons' tooltips and in the keyboard help.
 */
export const TOOL_SHORTCUT = { "add-source": "A", "delete-source": "D" } as const;

export const TOOL_BANNER: Record<Exclude<ToolMode, "select">, string> = {
  "add-source": "新增模式：點一下畫布放置源電荷（Esc 取消）",
  "delete-source": "刪除模式：點一下要刪除的源電荷（Esc 取消）",
};
