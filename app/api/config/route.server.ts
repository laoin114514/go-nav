import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NavConfig, WebsiteData } from "@/types";
import { SESSION_COOKIE, verifySession } from "@/lib/server/auth";
import {
	fillMissingWebsiteIcons,
	type FillMissingIconsResult,
} from "@/lib/server/auto-icon";
import { revalidateFrontendPaths } from "@/lib/server/revalidate-frontend";
import {
	getSafeAccessProtectionConfig,
	toAdminNavConfig,
} from "@/lib/site-access-config";
import {
	prepareNavForWrite,
	SiteAccessConfigError,
} from "@/lib/server/site-access";
import {
	getConfigRevision,
	readNav,
	readWebsiteData,
	writeNav,
	writeWebsiteData,
} from "@/lib/server/store";

async function requireAuth(): Promise<boolean> {
	const store = await cookies();
	const token = store.get(SESSION_COOKIE)?.value;
	return !!verifySession(token);
}

/**
 * 读取完整配置（需鉴权）。
 * 前台页面通过 SSR 直读本地文件，不使用此接口；
 * 这里只供后台、编辑器等已登录场景调用，避免外部直接拉取全量配置。
 */
export async function GET() {
	if (!(await requireAuth())) {
		return NextResponse.json({ error: "未登录" }, { status: 401 });
	}
	try {
		const revision = getConfigRevision();
		const res = NextResponse.json({
			websiteData: readWebsiteData(),
			nav: toAdminNavConfig(readNav()),
			revision,
		});
		res.headers.set("ETag", `"${revision}"`);
		return res;
	} catch (e) {
		return NextResponse.json({ error: (e as Error).message }, { status: 500 });
	}
}

/**
 * 更新配置：PUT { websiteData?, nav? }。鉴权。
 * 成功后触发前台页面 revalidate。
 */
export async function PUT(req: Request) {
	if (!(await requireAuth())) {
		return NextResponse.json({ error: "未登录" }, { status: 401 });
	}
	let body: { websiteData?: WebsiteData; nav?: NavConfig; revision?: string };
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "invalid body" }, { status: 400 });
	}
	try {
		const currentRevision = getConfigRevision();
		const ifMatch = req.headers.get("if-match")?.replace(/^"|"$/g, "");
		const expectedRevision = body.revision || ifMatch;
		if (expectedRevision && expectedRevision !== currentRevision) {
			return NextResponse.json(
				{
					error:
						"配置已被其它会话更新，请刷新后台后再保存，避免覆盖他人的改动。",
					revision: currentRevision,
				},
				{ status: 409 },
			);
		}
		const savedNav = body.nav
			? prepareNavForWrite(body.nav, readNav())
			: undefined;
		let iconStats: FillMissingIconsResult | undefined;
		if (body.websiteData) {
			// 写入前为没有设置图标的网站自动抓取 favicon（有超时预算，失败不影响保存）。
			try {
				iconStats = await fillMissingWebsiteIcons(body.websiteData);
				if (iconStats.filled > 0) {
					console.info(
						`[auto-icon] 已自动补全 ${iconStats.filled} 个网站图标` +
							(iconStats.timedOut ? "（超出时间预算，剩余项将在下次保存继续）" : ""),
					);
				}
			} catch (e) {
				console.warn(`[auto-icon] 自动抓取图标失败：${(e as Error).message}`);
			}
			writeWebsiteData(body.websiteData);
		}
		if (savedNav) writeNav(savedNav);
		revalidateFrontendPaths();
		const revision = getConfigRevision();
		const res = NextResponse.json({
			ok: true,
			revision,
			...(iconStats ? { iconStats } : {}),
			...(savedNav
				? {
						accessProtection: getSafeAccessProtectionConfig(
							savedNav.accessProtection,
						),
					}
				: {}),
		});
		res.headers.set("ETag", `"${revision}"`);
		return res;
	} catch (e) {
		return NextResponse.json(
			{ error: (e as Error).message },
			{ status: e instanceof SiteAccessConfigError ? 400 : 500 },
		);
	}
}
