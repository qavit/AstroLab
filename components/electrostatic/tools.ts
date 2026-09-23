/** Canvas interaction modes. "select" rests; add/delete persist until cancelled or a boundary. */
export type ToolMode = "select" | "add-source" | "delete-source";

/**
 * Single-letter shortcuts: neither is a browser default, and both are ignored while a text
 * field has focus. They are surfaced in the tool buttons' tooltips and in the keyboard help.
 */
export const TOOL_SHORTCUT = { "add-source": "A", "delete-source": "D" } as const;

export const TOOL_BANNER: Record<Exclude<ToolMode, "select">, string> = {
  "add-source": "新增模式：可連續點畫布放置源電荷（Esc 取消）",
  "delete-source": "刪除模式：可連續點源電荷刪除（Esc 取消）",
};
