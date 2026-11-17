import { describe, expect, test } from 'bun:test';
import { isIndexable, robotsTxt, sitemapXml } from './write-seo-files';

describe('write-seo-files', () => {
	test('noindex pages are not indexable', () => {
		expect(isIndexable('<meta name="robots" content="noindex,nofollow">')).toBe(false);
		expect(isIndexable('<meta name="robots" content="index,follow">')).toBe(true);
		expect(isIndexable('<title>No robots tag</title>')).toBe(true);
	});

	test('sitemap lists each path under the site origin', () => {
		const xml = sitemapXml('https://example.pages.dev', ['/', '/features/']);
		expect(xml).toContain('<loc>https://example.pages.dev/</loc>');
		expect(xml).toContain('<loc>https://example.pages.dev/features/</loc>');
	});

	test('robots.txt points at the sitemap on the same origin', () => {
		expect(robotsTxt('https://example.pages.dev')).toContain(
			'Sitemap: https://example.pages.dev/sitemap.xml',
		);
	});
});
