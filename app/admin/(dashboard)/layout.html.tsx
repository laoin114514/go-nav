import type { Metadata } from "next";
import { HtmlAdminRuntime } from "@/components/admin/html-admin-runtime";

export const dynamic = "force-static";

export const metadata: Metadata = {
	title: "laoin小站 配置后台",
	robots: {
		index: false,
		follow: false,
	},
};

export default function HtmlDashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <HtmlAdminRuntime>{children}</HtmlAdminRuntime>;
}
