// Fictional filler vendors (02 section 4.7). Names, cities and states are fixed; streets are invented per vendor by the seeded rng.
// Every name is stored with " (fictional)" (REV-65). No filler has a UEI or CIK.
import type { VendorSpec } from "./types";

type Cat = VendorSpec["category"];
interface FillerDef {
  id: string;
  name: string;
  city: string;
  state: string;
  zipBase: number;
  npa: string;
  label: string; // single-token domain label so lookalike detection works
  category: Cat;
  inactive?: boolean;
  legacyDomain?: string; // second, older domain (5 vendors)
  prefix?: string;
}

export const FILLERS: FillerDef[] = [
  { id: "V-10154", name: "Bluefen Geospatial Imaging LLC", city: "Boulder", state: "CO", zipBase: 80301, npa: "303", label: "bluefengeo", category: "small", inactive: true },
  { id: "V-10167", name: "Calloway Freight Brokers Inc", city: "Savannah", state: "GA", zipBase: 31401, npa: "912", label: "callowayfreight", category: "small", inactive: true },
  { id: "V-10179", name: "Elkhorn Radio Repair Co", city: "Melbourne", state: "FL", zipBase: 32901, npa: "321", label: "elkhornradio", category: "small", inactive: true },
  { id: "V-10186", name: "Larkspur Mobile Notary LLC", city: "Columbia", state: "SC", zipBase: 29201, npa: "803", label: "larkspurnotary", category: "small", inactive: true },
  { id: "V-10233", name: "Northgate Office Interiors LLC", city: "Columbia", state: "MD", zipBase: 21044, npa: "410", label: "northgateinteriors", category: "facilities", prefix: "NOI" },
  { id: "V-10234", name: "NORTHGATE OFFICE INTERIORS", city: "Columbia", state: "MD", zipBase: 21044, npa: "410", label: "northgateinteriors", category: "facilities", prefix: "NOJ" },
  { id: "V-10261", name: "Brackwater Survey Instrumnets LLC", city: "Annapolis", state: "MD", zipBase: 21401, npa: "410", label: "brackwatersurvey", category: "facilities", legacyDomain: "brackwatersvy.example" },
  { id: "V-10349", name: "Chesterfield Ridge Staffing Group Inc", city: "Richmond", state: "VA", zipBase: 23219, npa: "804", label: "chesterfieldridge", category: "staffing", prefix: "CRS" },
  { id: "V-10357", name: "Kettle Point Data Cabling LLC", city: "Fredericksburg", state: "VA", zipBase: 22401, npa: "540", label: "kettlepointcabling", category: "facilities" },
  { id: "V-10388", name: "Larkfield Translation Services LLC", city: "Silver Spring", state: "MD", zipBase: 20901, npa: "301", label: "larkfieldtranslation", category: "small" },
  { id: "V-10402", name: "Pembrook Secure Shredding Co", city: "Manassas", state: "VA", zipBase: 20109, npa: "703", label: "pembrookshredding", category: "small" },
  { id: "V-10471", name: "Ostrander Test & Calibration Inc", city: "Huntsville", state: "AL", zipBase: 35801, npa: "256", label: "ostranderlab", category: "facilities", prefix: "OTC" },
  { id: "V-10483", name: "Fallow Creek Catering LLC", city: "Alexandria", state: "VA", zipBase: 22304, npa: "703", label: "fallowcreek", category: "small", legacyDomain: "fallowcreekcafe.example" },
  { id: "V-10509", name: "Wexley Badge & Credential Supply Inc", city: "Baltimore", state: "MD", zipBase: 21202, npa: "410", label: "wexleybadge", category: "facilities" },
  { id: "V-10528", name: "Corbin Hollow HVAC Services LLC", city: "Leesburg", state: "VA", zipBase: 20175, npa: "703", label: "corbinhollow", category: "small", prefix: "CHH" },
  { id: "V-10544", name: "Juniper Lane Travel Management LLC", city: "Arlington", state: "VA", zipBase: 22201, npa: "703", label: "juniperlane", category: "small" },
  { id: "V-10561", name: "Sable Harbor Marine Logistics LLC", city: "Norfolk", state: "VA", zipBase: 23510, npa: "757", label: "sableharbor", category: "staffing", legacyDomain: "sableharborship.example" },
  { id: "V-10592", name: "Thornfield Environmental Labs Inc", city: "Frederick", state: "MD", zipBase: 21701, npa: "240", label: "thornfieldlabs", category: "facilities" },
  { id: "V-10604", name: "Ridgeback Network Supply Co", city: "Chantilly", state: "VA", zipBase: 20151, npa: "571", label: "ridgebacknet", category: "facilities", prefix: "RNS" },
  { id: "V-10617", name: "Ashgrove Records Management LLC", city: "Gaithersburg", state: "MD", zipBase: 20877, npa: "301", label: "ashgroverecords", category: "small", legacyDomain: "ashgroveiron.example" },
  { id: "V-10630", name: "Merriwether Cloud Reseller LLC", city: "Herndon", state: "VA", zipBase: 20170, npa: "703", label: "merriwethercloud", category: "facilities" },
  { id: "V-10645", name: "Sterling Fox Cyber Training LLC", city: "Tampa", state: "FL", zipBase: 33602, npa: "813", label: "sterlingfox", category: "small" },
  { id: "V-10671", name: "Copperline Fiber Splicing LLC", city: "Raleigh", state: "NC", zipBase: 27601, npa: "919", label: "copperlinefiber", category: "facilities" },
  { id: "V-10688", name: "Granite Shoals Engineering PLLC", city: "San Antonio", state: "TX", zipBase: 78205, npa: "210", label: "graniteshoals", category: "staffing" },
  { id: "V-10702", name: "Dovecote Furniture Installers LLC", city: "Rockville", state: "MD", zipBase: 20850, npa: "301", label: "dovecotefurniture", category: "small", legacyDomain: "dovecotemoving.example" },
  { id: "V-10718", name: "Bellhaven Print & Mail Inc", city: "Sterling", state: "VA", zipBase: 20164, npa: "703", label: "bellhavenprint", category: "small", prefix: "BPM" },
  { id: "V-10731", name: "Windrow Grounds Maintenance LLC", city: "Woodbridge", state: "VA", zipBase: 22191, npa: "703", label: "windrowgrounds", category: "small" },
  { id: "V-10749", name: "Pinecrest Medical Courier LLC", city: "Dayton", state: "OH", zipBase: 45402, npa: "937", label: "pinecrestcourier", category: "small" },
  { id: "V-10776", name: "Harrow & Vale Legal Support LLC", city: "Washington", state: "DC", zipBase: 20001, npa: "202", label: "harrowvale", category: "staffing" },
  { id: "V-10790", name: "Quarrytown Facilities Group LLC", city: "Chesapeake", state: "VA", zipBase: 23320, npa: "757", label: "quarrytownfg", category: "facilities" },
];

/** Fixed master phones for the two fillers whose numbers appear in scenario call logs (02 section 4.4). */
export const FIXED_PHONES: Record<string, string> = { "V-10604": "(571) 555-0138", "V-10592": "(240) 555-0152" };

export const STREET_WORDS = [
  "Alderwood", "Tannery", "Fiddler", "Marlow", "Heron", "Brindle", "Cobalt", "Sedgewick", "Kestrel", "Harbor Mill", "Whitlock", "Stonebridge",
  "Ferncliff", "Larchmont", "Quarry Hill", "Pellam", "Orchard Gate", "Redfield", "Thistle", "Gannet", "Winslow", "Tamarack", "Birchmere", "Ironwood",
];
export const STREET_SUFFIX = ["Rd", "Dr", "Blvd", "Way", "Pkwy", "Ln", "St", "Ct", "Pl", "Trl"];
export const STAFF = ["J. Whitfield (fictional)", "M. Okonkwo (fictional)", "T. Okafor (fictional)", "S. Brandvold (fictional)"];
