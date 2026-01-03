"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
	return (
		<Sonner
			theme="dark"
			position="bottom-right"
			className="toaster group"
			toastOptions={{
				classNames: {
					toast: "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
					description: "group-[.toast]:text-muted-foreground",
					actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
					cancelButton: "group-[.toast]:bg-secondary group-[.toast]:text-secondary-foreground",
					error: "group-[.toaster]:bg-destructive/90 group-[.toaster]:text-destructive-foreground group-[.toaster]:border-destructive",
					success: "group-[.toaster]:bg-green-900/90 group-[.toaster]:text-green-100 group-[.toaster]:border-green-700",
					warning: "group-[.toaster]:bg-yellow-900/90 group-[.toaster]:text-yellow-100 group-[.toaster]:border-yellow-700",
					info: "group-[.toaster]:bg-blue-900/90 group-[.toaster]:text-blue-100 group-[.toaster]:border-blue-700",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
