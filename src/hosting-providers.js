/**
 * Hosting & Cloud Provider Detection
 *
 * Curated list of ~150 known hosting/cloud/datacenter provider keywords
 * matched against ASN organization names from MaxMind GeoLite2-ASN.
 *
 * Usage:
 *   const { isHostingProvider, getProviderName, getAsnType } = require("./hosting-providers");
 *   isHostingProvider("Amazon.com, Inc.");  // true
 *   getProviderName("Amazon.com, Inc.");    // "Amazon Web Services (AWS)"
 */

// ─── KNOWN HOSTING / CLOUD PROVIDERS ─────────────────────────
// Each entry: [keyword to match (lowercase), display name]
const HOSTING_PROVIDERS = [
  // Major cloud providers
  ["amazon", "Amazon Web Services (AWS)"],
  ["aws", "Amazon Web Services (AWS)"],
  ["google cloud", "Google Cloud Platform"],
  ["google llc", "Google Cloud Platform"],
  ["microsoft", "Microsoft Azure"],
  ["azure", "Microsoft Azure"],
  ["digitalocean", "DigitalOcean"],
  ["linode", "Linode (Akamai)"],
  ["akamai", "Akamai Technologies"],
  ["vultr", "Vultr"],
  ["ovh", "OVHcloud"],
  ["hetzner", "Hetzner Online"],
  ["contabo", "Contabo"],
  ["scaleway", "Scaleway"],
  ["oracle cloud", "Oracle Cloud"],
  ["oracle corporation", "Oracle Cloud"],
  ["alibaba", "Alibaba Cloud"],
  ["aliyun", "Alibaba Cloud"],
  ["tencent", "Tencent Cloud"],
  ["huawei cloud", "Huawei Cloud"],
  ["ibm cloud", "IBM Cloud"],
  ["softlayer", "IBM Cloud (SoftLayer)"],
  ["rackspace", "Rackspace"],
  ["cloudflare", "Cloudflare"],
  ["fastly", "Fastly"],

  // VPS / Hosting providers
  ["hostinger", "Hostinger"],
  ["godaddy", "GoDaddy"],
  ["bluehost", "Bluehost"],
  ["hostgator", "HostGator"],
  ["namecheap", "Namecheap"],
  ["dreamhost", "DreamHost"],
  ["ionos", "IONOS"],
  ["1and1", "IONOS (1&1)"],
  ["strato", "Strato"],
  ["siteground", "SiteGround"],
  ["a2 hosting", "A2 Hosting"],
  ["inmotion", "InMotion Hosting"],
  ["interserver", "InterServer"],
  ["kamatera", "Kamatera"],
  ["upcloud", "UpCloud"],
  ["cherry", "Cherry Servers"],
  ["leaseweb", "LeaseWeb"],
  ["quadranet", "QuadraNet"],
  ["psychz", "Psychz Networks"],
  ["colocrossing", "ColoCrossing"],
  ["choopa", "Choopa (Vultr)"],
  ["the constant company", "Vultr"],
  ["serverius", "Serverius"],
  ["worldstream", "Worldstream"],
  ["i3d", "i3D.net"],
  ["datacamp", "DataCamp Limited"],
  ["hostwinds", "Hostwinds"],
  ["greengeeks", "GreenGeeks"],
  ["liquid web", "Liquid Web"],
  ["nexcess", "Nexcess"],
  ["kinsta", "Kinsta"],
  ["wpengine", "WP Engine"],
  ["pantheon", "Pantheon"],
  ["flywheel", "Flywheel"],
  ["netlify", "Netlify"],
  ["vercel", "Vercel"],
  ["render", "Render"],
  ["railway", "Railway"],
  ["heroku", "Heroku"],

  // Datacenter / Infrastructure
  ["equinix", "Equinix"],
  ["coresite", "CoreSite"],
  ["cyrusone", "CyrusOne"],
  ["datasite", "DataSite"],
  ["telehouse", "Telehouse"],
  ["interxion", "Interxion (Digital Realty)"],
  ["digital realty", "Digital Realty"],
  ["ntt communications", "NTT Communications"],
  ["cogent", "Cogent Communications"],
  ["zayo", "Zayo Group"],
  ["centurylink", "Lumen (CenturyLink)"],
  ["lumen", "Lumen Technologies"],
  ["level3", "Lumen (Level 3)"],
  ["hurricane electric", "Hurricane Electric"],
  ["he.net", "Hurricane Electric"],
  ["m247", "M247"],
  ["datapacket", "DataPacket"],
  ["servercentral", "ServerCentral"],
  ["tzulo", "Tzulo"],
  ["privatelayer", "PrivateLayer"],
  ["datawagon", "DataWagon"],
  ["buyvm", "BuyVM (Frantech)"],
  ["frantech", "Frantech Solutions"],
  ["nocix", "NOCIX"],
  ["host4geeks", "Host4Geeks"],
  ["phoenixnap", "PhoenixNAP"],
  ["100tb", "100TB"],
  ["multacom", "MultaCom"],
  ["fdcservers", "FDCServers"],
  ["sharktech", "Sharktech"],
  ["dacentec", "Dacentec"],
  ["incero", "Incero"],
  ["quadrant", "Quadrant Information Security"],

  // Regional hosting
  ["ucloud", "UCloud"],
  ["sakura", "Sakura Internet"],
  ["conoha", "ConoHa"],
  ["iij", "Internet Initiative Japan"],
  ["nifcloud", "NIFCLOUD"],
  ["yandex", "Yandex Cloud"],
  ["selectel", "Selectel"],
  ["reg.ru", "REG.RU"],
  ["beget", "Beget"],
  ["timeweb", "TimeWeb"],
  ["hostland", "Hostland"],
  ["fornex", "Fornex"],
  ["netcup", "Netcup"],
  ["webtropia", "Webtropia"],
  ["myLoc", "myLoc Managed IT"],
  ["host europe", "Host Europe"],
  ["plusserver", "PlusServer"],
  ["aruba", "Aruba S.p.A."],
  ["online s.a.s", "Online.net (Scaleway)"],
  ["iliad", "Free/Iliad"],
  ["ikoula", "Ikoula"],
  ["gandi", "Gandi"],
  ["infomaniak", "Infomaniak"],

  // CDN / Edge / Security
  ["stackpath", "StackPath"],
  ["sucuri", "Sucuri"],
  ["incapsula", "Imperva (Incapsula)"],
  ["imperva", "Imperva"],
  ["maxcdn", "MaxCDN (StackPath)"],
  ["keycdn", "KeyCDN"],
  ["bunny", "BunnyCDN"],
  ["cdn77", "CDN77"],

  // VPN / Privacy-oriented hosting (commonly used by VPNs)
  ["mullvad", "Mullvad VPN"],
  ["privacyfirst", "PrivacyFirst"],
  ["cryptostorm", "Cryptostorm"],
  ["31173", "31173 Services (VPN hosting)"],
  ["ponynet", "PonyNET"],
  ["flokinet", "FlokiNET"],
  ["trabia", "Trabia Network"],
  ["blazingfast", "BlazingFast"],
  ["combahton", "Combahton"],
];

// Pre-build lowercase lookup array for fast matching
const _providerLookup = HOSTING_PROVIDERS.map(([keyword, name]) => ({
  keyword: keyword.toLowerCase(),
  name,
}));

/**
 * Check if an ASN organization name matches a known hosting provider
 * @param {string} orgName — ASN organization name from MaxMind
 * @returns {boolean}
 */
function isHostingProvider(orgName) {
  if (!orgName) return false;
  const lower = orgName.toLowerCase();
  return _providerLookup.some((p) => lower.includes(p.keyword));
}

/**
 * Get the display name of the hosting provider
 * @param {string} orgName — ASN organization name from MaxMind
 * @returns {string|null}
 */
function getProviderName(orgName) {
  if (!orgName) return null;
  const lower = orgName.toLowerCase();
  const match = _providerLookup.find((p) => lower.includes(p.keyword));
  return match ? match.name : null;
}

/**
 * Classify the type of network based on ASN organization name
 * @param {string} orgName — ASN organization name
 * @returns {"hosting"|"isp"|"education"|"government"|"business"|"unknown"}
 */
function getAsnType(orgName) {
  if (!orgName) return "unknown";
  const lower = orgName.toLowerCase();

  if (isHostingProvider(orgName)) return "hosting";

  // Education
  if (
    lower.includes("university") ||
    lower.includes("college") ||
    lower.includes("academic") ||
    lower.includes("education") ||
    lower.includes("school") ||
    lower.includes("research") ||
    lower.includes(".edu")
  )
    return "education";

  // Government
  if (
    lower.includes("government") ||
    lower.includes("ministry") ||
    lower.includes("department of") ||
    lower.includes("federal") ||
    lower.includes("military") ||
    lower.includes("defense") ||
    lower.includes(".gov")
  )
    return "government";

  // Major ISPs (common residential providers)
  const ispKeywords = [
    "telecom", "telekom", "telefonica", "vodafone", "comcast", "verizon",
    "at&t", "att ", "sprint", "t-mobile", "tmobile", "charter",
    "spectrum", "cox", "frontier", "windstream", "centurytel",
    "airtel", "jio", "reliance", "bsnl", "mtnl", "tata communications",
    "bt ", "british telecom", "virgin media", "sky broadband", "talktalk",
    "orange", "sfr", "bouygues", "free ", "deutsche telekom",
    "movistar", "o2", "tres", "swisscom", "proximus", "kpn",
    "broadband", "cable", "wireless", "mobile", "cellular",
    "internet service", "communications",
  ];
  if (ispKeywords.some((kw) => lower.includes(kw))) return "isp";

  // Large enterprises / businesses
  if (
    lower.includes("corporation") ||
    lower.includes("inc.") ||
    lower.includes("ltd") ||
    lower.includes("limited") ||
    lower.includes("llc") ||
    lower.includes("gmbh") ||
    lower.includes("s.a.") ||
    lower.includes("co.")
  )
    return "business";

  return "unknown";
}

module.exports = { isHostingProvider, getProviderName, getAsnType, HOSTING_PROVIDERS };
