import { load } from 'cheerio';

export function htmlSnapshot(html: string, url: string) {
  const $ = load(html);
  $('script,style,noscript,input[type=password],input[type=hidden]').remove();
  return {
    source: 'taxisnet' as const, url, fetchedAt: new Date().toISOString(), title: $('title').text(),
    text: $('body').text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim(),
    links: $('a[href]').toArray().map(a => ({ text: $(a).text().trim(), url: new URL($(a).attr('href')!, url).href })),
    fields: [], tables: [],
  };
}
