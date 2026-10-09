import {createHash} from 'node:crypto';
import * as cheerio from 'cheerio';
import {listingURL} from './scraper.js';
export const SEARCH_URL='https://www.kv.ee/maa-muuk?orderby=cdwl';
export interface SearchListing {id:string;url:string;fingerprint:string;}
export function searchURL(offset:number){if(!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid search offset');const u=new URL(SEARCH_URL);if(offset)u.searchParams.set('start',String(offset));return u.href;}
export function parseSearch(input:string,offset:number){
 let html=input;
 if(input.trimStart().startsWith('{')){const data=JSON.parse(input);if(data.page!=='search'||typeof data.content!=='string')throw Error('Unexpected search response');html=data.content;}
 const $=cheerio.load(html);
 // Restrict discovery to land result cards, never links in adverts or the footer.
 const entries=new Map<string,SearchListing>();
 $('article.object-type-plot[data-object-id]').each((_,el)=>{
  const card=$(el),id=card.attr('data-object-id')!,path=card.attr('data-object-url')??card.find('a[data-skeleton="object"]').first().attr('href');
  if(!path||!/^\d{5,10}$/.test(id))return;
  let url:string;try{url=listingURL(new URL(path,'https://www.kv.ee').href);}catch{return;}
  if(url.match(/(\d{5,10})(?:\.html)?$/)?.[1]!==id)return;
  const summary=['.description .h2','.area','.rooms','.object-excerpt'].map(selector=>{const text=card.find(selector).clone();text.find('.object-promoted').remove();return text.text().replace(/\s+/g,' ').trim();});
  // Exclude financing offers and campaign text from the price fingerprint.
  const price=card.find('.price').first().clone();price.find('.campaign').remove();summary.push(price.text().replace(/\s+/g,' ').trim());
  entries.set(id,{id,url,fingerprint:createHash('sha256').update(JSON.stringify(summary)).digest('hex')});
 });
 if(!entries.size)throw Error('No readable land result cards; search may be blocked or its markup changed.');
 const offsets:number[]=[];
 $('.pagination a[href]').each((_,el)=>{try{const u=new URL($(el).attr('href')!,'https://www.kv.ee');if(u.origin!=='https://www.kv.ee'||u.pathname!=='/maa-muuk'||u.searchParams.get('orderby')!=='cdwl')return;const n=Number(u.searchParams.get('start')??0);if(Number.isSafeInteger(n)&&n>=0)offsets.push(n);}catch{}});
 const next=offsets.filter(n=>n>offset).sort((a,b)=>a-b)[0]??null;
 return {listings:[...entries.values()],nextOffset:next};
}
