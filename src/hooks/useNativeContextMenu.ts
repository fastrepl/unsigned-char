import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { type MouseEvent, useCallback } from "react";

export type MenuItemDef =
  | {
      id: string;
      text: string;
      action: () => void;
      disabled?: boolean;
    }
  | { separator: true };

type ContextMenuEvent = MouseEvent<HTMLElement> | globalThis.MouseEvent;

export async function showNativeContextMenu(items: MenuItemDef[], event: ContextMenuEvent) {
  event.preventDefault();
  event.stopPropagation();

  const menuItems = await Promise.all(
    items.map((item) =>
      "separator" in item
        ? PredefinedMenuItem.new({ item: "Separator" })
        : MenuItem.new({
            id: item.id,
            text: item.text,
            enabled: !item.disabled,
            action: item.action,
          }),
    ),
  );

  const menu = await Menu.new({ items: menuItems });
  await menu.popup();
}

export function useNativeContextMenu(items: MenuItemDef[]) {
  return useCallback(
    (event: MouseEvent<HTMLElement>) => {
      void showNativeContextMenu(items, event);
    },
    [items],
  );
}
