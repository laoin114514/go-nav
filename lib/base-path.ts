/**
 * Next.js basePath 在构建时内联，浏览器端与服务端共用这里的工具函数。
 * 未配置时（本地根路径部署）所有函数原样返回。
 */
export const BASE_PATH = normalizeBasePath(
	process.env.NEXT_PUBLIC_BASE_PATH,
);

function normalizeBasePath(value: string | undefined): string {
	const trimmed = (value ?? "").trim();
	if (!trimmed || trimmed === "/") return "";
	const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
	return withLeadingSlash.replace(/\/+$/, "");
}

/**
 * 给站内绝对路径补上 basePath。
 * 外链、协议相对地址（//）、data: 等非站内路径原样返回。
 */
export function withBasePath(path: string): string {
	if (!BASE_PATH || !path.startsWith("/") || path.startsWith("//")) {
		return path;
	}
	if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
	return `${BASE_PATH}${path}`;
}

/**
 * 从浏览器 pathname 中移除 basePath，得到应用内路由路径。
 * 例如 /laoin-site/site/foo/ -> /site/foo/
 */
export function stripBasePath(pathname: string): string {
	if (!BASE_PATH) return pathname;
	if (pathname === BASE_PATH) return "/";
	if (pathname.startsWith(`${BASE_PATH}/`)) {
		return pathname.slice(BASE_PATH.length);
	}
	return pathname;
}
