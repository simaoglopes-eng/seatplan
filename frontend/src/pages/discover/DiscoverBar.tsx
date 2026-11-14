// Search context has its own row; name/cuisine and the room filters stay beneath it.
import type {FeatureKey} from "../../api/discovery";
import {Button} from "../../design/components";
import {Chip,toggle} from "./Chips";
import {ContextControls} from "./ContextControls";
import type {Place} from "./discoverModel";
import {DISCOVERY_FEATURE_LABELS as LABELS} from "./discoverModel";
import {QUICK_FEATURES} from "./FilterDrawer";
interface Props {
 wide:boolean;text:string;onText:(value:string)=>void;place:Place|null;onPlace:(place:Place|null)=>void;
 locating:boolean;onNearMe:()=>void;date:string;time:string;party:string;onDate:(value:string)=>void;onTime:(value:string)=>void;onParty:(value:string)=>void;onClearWhen:()=>void;
 features:FeatureKey[];onFeatures:(value:FeatureKey[])=>void;filterCount:number;drawerOpen:boolean;onDrawer:()=>void;
}
export function DiscoverBar(p:Props){
 const search=<div className="discover-search-field"><label className="visually-hidden" htmlFor="discover-search">Restaurant or cuisine</label><span aria-hidden="true">⌕</span><input id="discover-search" type="search" aria-label="Restaurant or cuisine" placeholder="Restaurant or cuisine" value={p.text} maxLength={80} autoComplete="off" onChange={e=>p.onText(e.target.value)}/>{p.text&&<button type="button" aria-label="Clear search" onClick={()=>p.onText("")}>×</button>}</div>;
 return <form className="discover-bar" role="search" onSubmit={e=>{e.preventDefault();if(p.wide && !p.date)document.querySelector<HTMLInputElement>('[aria-label="Date"]')?.focus();else {const results=document.getElementById("discover-results-title");results?.focus();results?.scrollIntoView?.({block:"nearest"});}}}>
  {p.wide&&<div className="discover-primary"><ContextControls variant="capsule" place={p.place} onPlace={p.onPlace} date={p.date} time={p.time} party={p.party} onDate={p.onDate} onTime={p.onTime} onParty={p.onParty} onClearWhen={p.onClearWhen}/><Button type="submit">Find a table →</Button></div>}
  <div className="discover-secondary">{search}{p.wide&&<div className="discover-quick" role="group" aria-label="Quick filters">{QUICK_FEATURES.map(key=><Chip key={key} pressed={p.features.includes(key)} onClick={()=>p.onFeatures(toggle(p.features,key))}>{LABELS[key]}</Chip>)}</div>}<Button variant="secondary" aria-haspopup="dialog" aria-expanded={p.drawerOpen} onClick={p.onDrawer}>Filters{p.filterCount?` (${p.filterCount})`:""}<span aria-hidden="true"> ☷</span></Button>{p.wide&&<Button variant="ghost" busy={p.locating} onClick={p.onNearMe}>Near me</Button>}</div>
 </form>;
}
