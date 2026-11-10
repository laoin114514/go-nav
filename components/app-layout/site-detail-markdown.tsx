"use client";

import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { withBasePath } from "@/lib/base-path";

export function SiteDetailMarkdown({ markdown }: { markdown: string }) {
	return (
		<div className="site-detail-markdown">
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkBreaks]}
				skipHtml
				components={{
					a: ({ href, children }) => {
						const isExternal = /^https?:\/\//i.test(href ?? "");
						return (
							<a
								href={href}
								target={isExternal ? "_blank" : undefined}
								rel={isExternal ? "noopener noreferrer" : undefined}
							>
								{children}
							</a>
						);
					},
					img: ({ src, alt }) => (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={typeof src === "string" ? withBasePath(src) : undefined}
							alt={alt ?? ""}
							loading="lazy"
							decoding="async"
						/>
					),
				}}
			>
				{markdown}
			</ReactMarkdown>
		</div>
	);
}
