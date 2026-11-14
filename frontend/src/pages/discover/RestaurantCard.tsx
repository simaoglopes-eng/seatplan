import {Link} from "react-router-dom";
import {useState} from "react";
import type {FeatureKey,RestaurantCard as Card,SearchWhen} from "../../api/discovery";
import {DISCOVERY_FEATURE_LABELS,cuisineLabel,formatDistance,priceText,restaurantHref} from "./discoverModel";
interface Props {card:Card;when:SearchWhen|null;navigationWhen?:SearchWhen|null;highlighted:boolean;onHighlight:(id:string|null)=>void;number?:number;pending?:boolean;priorityFeatures?:FeatureKey[];selected?:boolean;compact?:boolean}
export function RestaurantCard({card,when,highlighted,onHighlight,number,pending=false,priorityFeatures=[],selected=false,compact=false}:Props){
 const [failed,setFailed]=useState(false);
 const features:FeatureKey[]=[...new Set([...priorityFeatures,"view","terrace","sun","accessible"] as FeatureKey[])];
 const attribute=features.find(key=>card.features[key]);
 const price=priceText(card.price_level);const distance=formatDistance(card.distance_m);
 return <article className={`discover-card${highlighted?" is-highlighted":""}${selected?" is-selected":""}${compact?" is-compact":""}`} aria-current={selected?"true":undefined} id={compact?undefined:`card-${card.public_id}`} aria-labelledby={`${compact?"pin-name":"name"}-${card.public_id}`} onMouseEnter={()=>onHighlight(card.public_id)} onMouseLeave={()=>onHighlight(null)} onFocus={()=>onHighlight(card.public_id)} onBlur={()=>onHighlight(null)}>
  <Link to={restaurantHref(card,null)} className="discover-card-photo" tabIndex={-1} aria-hidden="true">{card.cover_url&&!failed?<img src={card.cover_url} alt={card.cover_alt??""} loading="lazy" onError={()=>setFailed(true)} width={640} height={400}/>:<span className="discover-card-nophoto">Photo unavailable</span>}</Link>
  <div className="discover-card-body">
   <h3 id={`${compact?"pin-name":"name"}-${card.public_id}`}>{number!==undefined&&<span className="discover-card-number" aria-hidden="true">{number}</span>}<Link to={restaurantHref(card,null)}>{card.name}</Link></h3>
   <p className="discover-card-line">{card.cuisines.map(cuisineLabel).join(", ")}{price&&<> · <span aria-hidden="true">{price}</span><span className="visually-hidden">Price level {card.price_level} of 4</span></>}{distance&&` · ${distance}`}</p>
   {attribute&&<p className="discover-ambience">{DISCOVERY_FEATURE_LABELS[attribute]}</p>}
   {when?<div className="discover-times" aria-label={`Available near ${when.time} for ${when.party}`}>
    {card.next_times.length?[...card.next_times].sort().map(time=>pending?<button key={time} className="discover-time" disabled>{time}</button>:<Link key={time} className={`discover-time${time===when.time?" is-requested":""}`} to={restaurantHref(card,when,time)}>{time}</Link>):<span className="discover-times-label">No free table near {when.time}.</span>}
   </div>:<Link className="discover-card-more" to={restaurantHref(card,null)}>See available times →</Link>}
  </div>
 </article>;
}
