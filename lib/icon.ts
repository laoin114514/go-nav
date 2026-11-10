import { withBasePath } from "@/lib/base-path";

export function isInlineSvgIcon(value: string | undefined): boolean {
	return /^<svg[\s>]/i.test(value?.trimStart() ?? "");
}

export function getIconImageSrc(value: string | undefined): string | null {
	if (!value) return null;
	const icon = value.trim();
	if (isInlineSvgIcon(icon)) {
		return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon)}`;
	}
	if (
		icon.startsWith("http://") ||
		icon.startsWith("https://") ||
		icon.startsWith("/") ||
		icon.startsWith("data:image/")
	) {
		return withBasePath(icon);
	}
	return null;
}
