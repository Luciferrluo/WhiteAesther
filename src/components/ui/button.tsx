import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const buttonVariants = cva("ui-button", {
  variants: {
    variant: { primary: "", secondary: "secondary", icon: "icon" },
    size: { normal: "", large: "large" },
    full: { true: "full" },
  },
  defaultVariants: { variant: "primary", size: "normal" },
});

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, full, children, ...props }: PropsWithChildren<Props>) {
  return <button className={cn(buttonVariants({ variant, size, full }), className)} {...props}>{children}</button>;
}
