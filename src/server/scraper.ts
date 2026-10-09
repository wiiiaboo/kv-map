import * as cheerio from 'cheerio';
import type { Listing } from './types.js';
export const cadastralNumbers = (text:string) => [...new Set(text.match(/(?<!\d)\d{5}:\d{3}:\d{4}(?!\d)/g) ?? [])];
export function listingURL(input:string) {
 const u=new URL(input);
 if(u.protocol!=='https:' || !['kv.ee','www.kv.ee'].includes(u.hostname) || u.port || u.username || u.password || !/(?:^\/\d{5,10}$|-\d{5,10}(?:\.html)?$)/.test(u.pathname)) throw new Error('Enter an individual HTTPS KV.ee listing URL.');
 u.hostname='www.kv.ee'; u.search='';u.hash=''; return u.href;
}
const number = (value:string) => { const n=Number(value.replace(/[\s\u00a0]/g,'').replace(',','.')); return Number.isFinite(n)&&n>0?n:null; };
export function parseListing(html:string, input:string): Omit<Listing,'parcels'|'unmatchedNumbers'> {
 const url=listingURL(input);
 if(html.trimStart().startsWith('{')){const envelope=JSON.parse(html);if(envelope.page!=='object'||typeof envelope.content!=='string')throw new Error('Unexpected KV.ee response.');html=envelope.content + (typeof envelope.structuredData==='string'?envelope.structuredData:'');}
 const $=cheerio.load(html);
 let schema:any;
 $('script[type="application/ld+json"]').each((_,el)=>{try {const data=JSON.parse($(el).text()); const entries=Array.isArray(data)?data:data['@graph']??[data];schema=entries.find((x:any)=>x['@type']==='RealEstateListing')??schema;}catch{}});
 const header=$('h1').first().text().trim();
 const category=$('.meta-table tr').first().text();
 if(!header || !/Müüa maatükk/i.test(category)) throw new Error('Page is not a readable active KV.ee land-for-sale listing.');
 const structured:string[]=[]; let area:number|null=null;
 $('.meta-table tr').each((_,el)=>{const label=$(el).find('th').text().trim(), value=$(el).find('td').text().trim();if(/katastri(number|tunnus)/i.test(label))structured.push(...cadastralNumbers(value));if(/Krundi pind/i.test(label)){ const match=value.match(/([\d\s.,]+)\s*(m²|ha)/);if(match){area=number(match[1]);if(area&&match[2]==='ha')area*=10000;}}});
 const description=$('.description-content').first().html();
 const descriptionText=description ? cheerio.load(description.replace(/<br\s*\/?\s*>/gi,'\n')).text().trim() : schema?.description??'';
 const extra=cadastralNumbers(descriptionText);
 const price=number(String(schema?.mainEntity?.offers?.price??'')) ?? number(String($('.label.campaign[data-price]').first().attr('data-price')??''));
 area=area ?? number(String(schema?.mainEntity?.floorSize?.value??''));
 const perMatch=$('.price-outer').first().text().match(/([\d.,]+)\s*€\/m²/);
 const now=new Date().toISOString();
 return {id:url.match(/(\d{5,10})(?:\.html)?$/)![1],title:header,price,area,pricePerM2:perMatch?number(perMatch[1]):null,url,description:descriptionText,cadastralNumbers:[...new Set([...structured,...extra])],structuredNumbers:[...new Set(structured)],descriptionNumbers:extra,firstSeen:now,lastSeen:now,active:true,postedAt:schema?.datePosted??null};
}
