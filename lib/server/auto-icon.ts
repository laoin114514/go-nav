import type { NavCategory, NavSite, WebsiteData } from "@/types";
import {
	fetchPublicResource,
	readResponseBytes,
} from "@/lib/server/fetch-utils";
import {
	findFaviconCandidates,
	saveFaviconFromUrl,
} from "@/lib/server/favicon";

/** 单次保存最多花在自动抓取图标上的时间（毫秒），避免拖慢保存请求。 */
const DEFAULT_BUDGET_MS = 20_000;
/** 同时抓取的网站数量。 */
const DEFAULT_CONCURRENCY = 6;
/** 抓取页面 HTML 的超时与体积上限。 */
const PAGE_TIMEOUT_MS = 6_000;
const MAX_PAGE_BYTES = 512 * 1024;
/** 单个图标下载超时。 */
const ICON_TIMEOUT_MS = 6_000;
/** 每个站点最多尝试的图标候选数。 */
const MAX_CANDIDATES = 4;
const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface FillMissingIconsResult {
	/** 缺少图标并尝试抓取的网站数 */
	total: number;
	/** 成功补全的数量 */
	filled: number;
	/** 尝试后仍然失败的数量 */
	failed: number;
	/** 缺少图标但不是 http(s) 网址而跳过的数量 */
	skipped: number;
	/** 是否因为时间预算耗尽而提前结束（剩余项下次保存会继续） */
	timedOut: boolean;
}

export interface FillMissingIconsOptions {
	/** 本次抓取的总时间预算，默认 20 秒 */
	budgetMs?: number;
	/** 并发数，默认 6 */
	concurrency?: number;
}

/** 递归收集所有网站条目。 */
function collectSites(
	categories: NavCategory[],
	out: NavSite[] = [],
): NavSite[] {
	for (const category of categories) {
		if (category.sites && category.sites.length > 0) {
			out.push(...category.sites);
		}
		if (category.children && category.children.length > 0) {
			collectSites(category.children, out);
		}
	}
	return out;
}

function isHttpUrl(raw: string): boolean {
	try {
		const url = new URL(raw.trim());
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

function remainingMs(deadline: number, maxMs: number): number {
	return Math.max(1_000, Math.min(maxMs, deadline - Date.now()));
}

/**
 * 抓取单个网站的图标并写入 site.icon。
 * 先请求页面 HTML 解析 <link rel="icon">，失败时退回 /favicon.ico。
 */
async function resolveSiteIcon(
	site: NavSite,
	deadline: number,
): Promise<boolean> {
	const pageUrl = new URL(site.url.trim());
	let candidates: string[];

	try {
		const res = await fetchPublicResource(pageUrl, {
			method: "GET",
			timeoutMs: remainingMs(deadline, PAGE_TIMEOUT_MS),
			maxBytes: MAX_PAGE_BYTES,
			headers: {
				"User-Agent": USER_AGENT,
				Accept: "text/html,application/xhtml+xml",
			},
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const bytes = await readResponseBytes(res, MAX_PAGE_BYTES);
		const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
		const finalUrl = res.url ? new URL(res.url) : pageUrl;
		candidates = findFaviconCandidates(html, finalUrl);
	} catch {
		candidates = [new URL("/favicon.ico", pageUrl).href];
	}

	const prefix = `favicon-${pageUrl.hostname}`;
	const limit = Math.min(candidates.length, MAX_CANDIDATES);
	for (let i = 0; i < limit; i += 1) {
		if (Date.now() >= deadline) return false;
		try {
			const icon = await saveFaviconFromUrl(candidates[i], {
				fileNamePrefix: prefix,
				timeoutMs: remainingMs(deadline, ICON_TIMEOUT_MS),
			});
			site.icon = icon;
			return true;
		} catch {
			// 当前候选不可用，继续尝试下一个候选。
		}
	}
	return false;
}

/**
 * 为单个网站补全图标（供投稿审核等单条写入场景使用）。
 */
export async function fillMissingSiteIcon(
	site: NavSite,
	options?: FillMissingIconsOptions,
): Promise<boolean> {
	if (typeof site.icon === "string" && site.icon.trim() !== "") return true;
	if (typeof site.url !== "string" || !isHttpUrl(site.url)) return false;
	const deadline = Date.now() + (options?.budgetMs ?? DEFAULT_BUDGET_MS);
	try {
		return await resolveSiteIcon(site, deadline);
	} catch {
		return false;
	}
}

/**
 * 为缺少图标的网站自动抓取 favicon（复用后台图床/本地上传配置）。
 *
 * - 已设置 icon 的网站不动；
 * - 非 http(s) 网址直接跳过；
 * - 有总时间预算，超时未处理的网站留到下次保存继续；
 * - 完全相同 url 的多个条目只抓取一次。
 */
export async function fillMissingWebsiteIcons(
	websiteData: WebsiteData,
	options?: FillMissingIconsOptions,
): Promise<FillMissingIconsResult> {
	const sites = collectSites(websiteData.categories);
	const pending: NavSite[] = [];
	let skipped = 0;

	for (const site of sites) {
		if (typeof site.icon === "string" && site.icon.trim() !== "") continue;
		if (typeof site.url !== "string" || !isHttpUrl(site.url)) {
			skipped += 1;
			continue;
		}
		pending.push(site);
	}

	const result: FillMissingIconsResult = {
		total: pending.length,
		filled: 0,
		failed: 0,
		skipped,
		timedOut: false,
	};
	if (pending.length === 0) return result;

	const budgetMs = options?.budgetMs ?? DEFAULT_BUDGET_MS;
	const concurrency = Math.max(
		1,
		Math.min(options?.concurrency ?? DEFAULT_CONCURRENCY, 16),
	);
	const deadline = Date.now() + budgetMs;
	const resolvedByUrl = new Map<string, string>();
	let cursor = 0;

	const worker = async () => {
		while (true) {
			if (Date.now() >= deadline) {
				result.timedOut = true;
				return;
			}
			const index = cursor;
			cursor += 1;
			if (index >= pending.length) return;

			const site = pending[index];
			const url = site.url.trim();
			const cached = resolvedByUrl.get(url);
			if (cached) {
				site.icon = cached;
				result.filled += 1;
				continue;
			}

			try {
				const ok = await resolveSiteIcon(site, deadline);
				if (ok && site.icon) {
					resolvedByUrl.set(url, site.icon);
					result.filled += 1;
				} else {
					result.failed += 1;
				}
			} catch {
				result.failed += 1;
			}
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(concurrency, pending.length) }, () => worker()),
	);

	if (result.failed > 0) {
		console.warn(`[auto-icon] ${result.failed} 个网站图标抓取失败`);
	}
	return result;
}
