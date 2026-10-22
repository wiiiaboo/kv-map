import type {Feature} from 'geojson';
export const UNKNOWN_USE='__unknown__';
export interface LandUse {code:string;label:string;estonian:string;percentage:number|null;}
const labels:Record<string,[string,string]>={
 ELAMUMAA:['Residential','Elamumaa'], MAATULUNDUSMAA:['Agricultural / forestry','Maatulundusmaa'],
 ARIMAA:['Commercial','Ärimaa'], TOOTMISMAA:['Industrial','Tootmismaa'], TRANSPORDIMAA:['Transport','Transpordimaa'],
 ULDKASUTATAV_MAA:['Public use','Üldkasutatav maa'], UHISKONDLIKE_EHITISTE_MAA:['Public buildings','Ühiskondlike ehitiste maa'],
 RIIGIKAITSEMAA:['National defence','Riigikaitsemaa'], KAITSEALUNE_MAA:['Protected land','Kaitsealune maa'],
 MAETOOSTUSMAA:['Mining','Mäetööstusmaa'], TURBATOOSTUSMAA:['Peat production','Turbatööstusmaa'],
 JAATMEHOIDLA_MAA:['Waste storage','Jäätmehoidla maa'], SIHTOTSTARBETA_MAA:['Unassigned','Sihtotstarbeta maa'], VEEKOGUDE_MAA:['Water bodies','Veekogude maa'],
};
export function landUses(parcel:Pick<Feature,'properties'>):LandUse[]{
 const properties=parcel.properties??{};const result:LandUse[]=[];
 for(let i=1;i<=3;i++){
  const raw=properties[`siht${i}`];if(typeof raw!=='string'||!raw.trim())continue;
  const code=raw.trim().toUpperCase();const value=properties[`so_prts${i}`];
  const percentage=value===null||value===undefined||value===''?null:Number(value);
  if(percentage===0)continue;
  const names=labels[code];const label=names?.[0]??raw.replaceAll('_',' ');
  result.push({code,label,estonian:names?.[1]??raw.replaceAll('_',' '),percentage:percentage!==null&&Number.isFinite(percentage)&&percentage>0&&percentage<=100?percentage:null});
 }
 return result;
}
export function landUseText(parcel:Pick<Feature,'properties'>){const uses=landUses(parcel);return uses.length?uses.map(u=>`${u.label}${u.percentage===null?'':` ${u.percentage}%`}`).join(' · '):'Land use unknown';}
