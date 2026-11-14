import type {ReactNode} from "react";
import type {FeatureKey} from "../../api/discovery";
import {CUISINES} from "../../api/owner";
import {Button,Dialog} from "../../design/components";
import {Chip,Chips,toggle} from "./Chips";
import {cuisineLabel,DISCOVERY_FEATURE_LABELS as LABELS} from "./discoverModel";
export const QUICK_FEATURES:FeatureKey[]=["sun","view","terrace"];
interface Props {
 open:boolean;onClose:()=>void;onApply:()=>void;
 cuisines:string[];onCuisines:(value:string[])=>void;prices:number[];onPrices:(value:number[])=>void;
 features:FeatureKey[];onFeatures:(value:FeatureKey[])=>void;
 allCuisines:boolean;onAllCuisines:(value:boolean)=>void;hasWhen:boolean;
 availableOnly:boolean;onAvailableOnly:(value:boolean)=>void;onClear:()=>void;total:number|null;
 narrowExtras?:ReactNode;showQuick:boolean;
}
export function FilterDrawer(p:Props){
 return <div className="discover-filters-modal"><Dialog open={p.open} title="Filters" onClose={p.onClose} placement="side" actions={<>
  <Button variant="ghost" onClick={p.onClear}>Clear filters</Button>
  <Button onClick={p.onApply}>Apply{p.total===null?" filters":` · Show ${p.total} ${p.total===1?"restaurant":"restaurants"}`}</Button>
 </>}>
  <button type="button" className="discover-filter-close" aria-label="Cancel filters" onClick={p.onClose}>×</button>
  <div className="discover-drawer">
   <section className="discover-context-group"><h3>When and where</h3>{p.narrowExtras}</section>
   <Chips label="Room features">{QUICK_FEATURES.map(key=><Chip key={key} pressed={p.features.includes(key)} onClick={()=>p.onFeatures(toggle(p.features,key))}>{LABELS[key]}</Chip>)}<p className="discover-filter-note">Sunlight at your booking time appears on the table map.</p></Chips>
   <Chips label="Accessibility"><Chip pressed={p.features.includes("accessible")} onClick={()=>p.onFeatures(toggle(p.features,"accessible"))}>Wheelchair-accessible table</Chip><p className="discover-filter-note">High chair requests are available when booking.</p></Chips>
   <div className="discover-filter-selects">
    <details><summary><span>Cuisine</span><strong>{p.cuisines.length?p.cuisines.map(cuisineLabel).join(", "):"Any"}</strong></summary><Chips label="Cuisine">{CUISINES.filter((key,i)=>p.allCuisines||i<8||p.cuisines.includes(key)).map(key=><Chip key={key} pressed={p.cuisines.includes(key)} onClick={()=>p.onCuisines(toggle(p.cuisines,key))}>{cuisineLabel(key)}</Chip>)}<button type="button" className="discover-more" aria-expanded={p.allCuisines} onClick={()=>p.onAllCuisines(!p.allCuisines)}>{p.allCuisines?"Fewer cuisines":"More cuisines"}</button></Chips></details>
    <details><summary><span>Price</span><strong>{p.prices.length?p.prices.map(n=>"€".repeat(n)).join(", "):"Any"}</strong></summary><Chips label="Price">{[1,2,3,4].map(n=><Chip key={n} label={`${"€".repeat(n)}, price level ${n} of 4`} pressed={p.prices.includes(n)} onClick={()=>p.onPrices(toggle(p.prices,n))}>{"€".repeat(n)}</Chip>)}</Chips></details>
   </div>
   {p.hasWhen&&<Chips label="Availability"><Chip pressed={p.availableOnly} onClick={()=>p.onAvailableOnly(!p.availableOnly)}>Available near this time</Chip><p className="discover-filter-note">Includes seating times within 60 minutes of your chosen time.</p></Chips>}
  </div>
 </Dialog></div>;
}
