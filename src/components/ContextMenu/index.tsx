import React, { useState } from "react";
import { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu';

export type MenuItem = {
  id: string | number;
  label: string;
  icon: LucideIcon;
};

type ContextMenuProps = {
  children?: React.ReactNode;
  menuItems?: MenuItem[];
  onSelect?: (item: MenuItem) => void;
};

export const ContextMenu = ({
  children,
  menuItems = [],
  onSelect,
}: ContextMenuProps) => {

  const [open, setOpen] = useState<boolean>(false);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
  };

  return (
    <BaseContextMenu.Root open={open} onOpenChange={handleOpenChange}>
      <BaseContextMenu.Trigger className="select-none outline-none h-full w-full block">
        {children}
      </BaseContextMenu.Trigger>

      <BaseContextMenu.Portal keepMounted>
        <BaseContextMenu.Positioner
          align="start"
          sideOffset={2}
          className="outline-none z-[99999]"
        >
          <BaseContextMenu.Popup
            className="relative min-w-[220px] rounded-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.4)] outline-none bg-[#1C1C1E]/95 backdrop-blur-2xl border border-white/10 p-1.5 origin-top-left"
            render={
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -5 }}
                animate={open ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.95, y: -5 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              />
            }
          >
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <BaseContextMenu.Item
                  key={item.id}
                  onClick={() => onSelect?.(item)}
                  className="flex items-center justify-between w-full px-3 py-2 text-[13px] text-white/90 cursor-default select-none outline-none transition-colors rounded-[8px] hover:bg-white/10 hover:text-white data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
                >
                  <span className="font-medium tracking-wide truncate">{item.label}</span>
                  <Icon size={15} className="shrink-0 text-white/60 ml-4 group-hover:text-white" />
                </BaseContextMenu.Item>
              );
            })}
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.Root>
  );
};
