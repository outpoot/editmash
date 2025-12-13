"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
	return (
		<Sonner
			theme="dark"
			className="toaster group"
			toastOptions={{
				classNames: {
					toast: "group toast group-[.toaster]:bg-zinc-900 group-[.toaster]:text-zinc-100 group-[.toaster]:border-zinc-800 group-[.toaster]:shadow-lg",
					description: "group-[.toast]:text-zinc-400",
					actionButton: "group-[.toast]:bg-zinc-100 group-[.toast]:text-zinc-900",
					cancelButton: "group-[.toast]:bg-zinc-800 group-[.toast]:text-zinc-400",
					error: "group-[.toaster]:bg-red-900/90 group-[.toaster]:text-red-100 group-[.toaster]:border-red-700",
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
