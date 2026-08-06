/**
 * Birth place → coordinates, without a geocoding API.
 *
 * Only the **ascendant** needs this. Guna milan does not: it is decided by the
 * Moon's longitude, which is the same in Jaipur and in Jamshedpur — the place
 * would only change it through the timezone, and every city here is IST. So a
 * miss in this table costs the lagna and nothing else, and `chart.ts` degrades
 * to a Moon-only kundli rather than guessing a lagna it cannot know.
 *
 * That is also why this is a hand-kept list and not a dependency: ~170 cities
 * covers where Indian matrimony users are actually born, a fuzzy match catches
 * the spelling drift ("Bombay", "Bangalore", "Prayagraj"), and the failure mode
 * is honest silence instead of a plausible wrong chart.
 */

export interface Place {
  name: string;
  lat: number;
  /** East-positive, as `ascendant()` expects. */
  lon: number;
  /** Minutes east of UTC. Every entry here is IST (+330). */
  tzOffsetMinutes: number;
}

const IST = 330;

/** [display name, latitude, longitude, ...aliases] */
const CITIES: ReadonlyArray<readonly [string, number, number, ...string[]]> = [
  ["Delhi", 28.6139, 77.209, "new delhi", "dilli", "ndls"],
  ["Mumbai", 19.076, 72.8777, "bombay", "bambai"],
  ["Kolkata", 22.5726, 88.3639, "calcutta"],
  ["Chennai", 13.0827, 80.2707, "madras"],
  ["Bengaluru", 12.9716, 77.5946, "bangalore", "bengalore"],
  ["Hyderabad", 17.385, 78.4867, "secunderabad"],
  ["Ahmedabad", 23.0225, 72.5714, "amdavad"],
  ["Pune", 18.5204, 73.8567, "poona"],
  ["Surat", 21.1702, 72.8311],
  ["Jaipur", 26.9124, 75.7873],
  ["Lucknow", 26.8467, 80.9462],
  ["Kanpur", 26.4499, 80.3319],
  ["Nagpur", 21.1458, 79.0882],
  ["Indore", 22.7196, 75.8577],
  ["Bhopal", 23.2599, 77.4126],
  ["Patna", 25.5941, 85.1376],
  ["Ludhiana", 30.901, 75.8573],
  ["Agra", 27.1767, 78.0081],
  ["Nashik", 19.9975, 73.7898, "nasik"],
  ["Vadodara", 22.3072, 73.1812, "baroda"],
  ["Varanasi", 25.3176, 82.9739, "banaras", "kashi", "benares"],
  ["Srinagar", 34.0837, 74.7973],
  ["Aurangabad", 19.8762, 75.3433, "chhatrapati sambhajinagar"],
  ["Dhanbad", 23.7957, 86.4304],
  ["Amritsar", 31.634, 74.8723],
  ["Prayagraj", 25.4358, 81.8463, "allahabad"],
  ["Ranchi", 23.3441, 85.3096],
  ["Howrah", 22.5958, 88.2636],
  ["Coimbatore", 11.0168, 76.9558],
  ["Jabalpur", 23.1815, 79.9864],
  ["Gwalior", 26.2183, 78.1828],
  ["Vijayawada", 16.5062, 80.648],
  ["Jodhpur", 26.2389, 73.0243],
  ["Madurai", 9.9252, 78.1198],
  ["Raipur", 21.2514, 81.6296],
  ["Kota", 25.2138, 75.8648],
  ["Chandigarh", 30.7333, 76.7794],
  ["Guwahati", 26.1445, 91.7362, "gauhati"],
  ["Solapur", 17.6599, 75.9064, "sholapur"],
  ["Hubli", 15.3647, 75.124, "hubballi", "dharwad"],
  ["Mysuru", 12.2958, 76.6394, "mysore"],
  ["Tiruchirappalli", 10.7905, 78.7047, "trichy"],
  ["Bareilly", 28.367, 79.4304],
  ["Aligarh", 27.8974, 78.088],
  ["Moradabad", 28.8386, 78.7733],
  ["Gurugram", 28.4595, 77.0266, "gurgaon"],
  ["Noida", 28.5355, 77.391, "greater noida"],
  ["Ghaziabad", 28.6692, 77.4538],
  ["Faridabad", 28.4089, 77.3178],
  ["Meerut", 28.9845, 77.7064],
  ["Rajkot", 22.3039, 70.8022],
  ["Jalandhar", 31.326, 75.5762],
  ["Thiruvananthapuram", 8.5241, 76.9366, "trivandrum"],
  ["Kochi", 9.9312, 76.2673, "cochin", "ernakulam"],
  ["Kozhikode", 11.2588, 75.7804, "calicut"],
  ["Thrissur", 10.5276, 76.2144, "trichur"],
  ["Bhubaneswar", 20.2961, 85.8245],
  ["Cuttack", 20.4625, 85.8828],
  ["Dehradun", 30.3165, 78.0322],
  ["Haridwar", 29.9457, 78.1642],
  ["Shimla", 31.1048, 77.1734],
  ["Jammu", 32.7266, 74.857],
  ["Udaipur", 24.5854, 73.7125],
  ["Ajmer", 26.4499, 74.6399],
  ["Bikaner", 28.0229, 73.3119],
  ["Alwar", 27.5665, 76.6250],
  ["Bhilwara", 25.3407, 74.6313],
  ["Sikar", 27.6094, 75.1399],
  ["Gorakhpur", 26.7606, 83.3732],
  ["Jhansi", 25.4484, 78.5685],
  ["Mathura", 27.4924, 77.6737, "vrindavan"],
  ["Ayodhya", 26.7922, 82.1998, "faizabad"],
  ["Muzaffarpur", 26.1209, 85.3647],
  ["Gaya", 24.7955, 85.0002],
  ["Bhagalpur", 25.2425, 86.9842],
  ["Darbhanga", 26.1542, 85.8918],
  ["Jamshedpur", 22.8046, 86.2029, "tatanagar"],
  ["Bokaro", 23.6693, 86.1511],
  ["Siliguri", 26.7271, 88.3953],
  ["Durgapur", 23.5204, 87.3119],
  ["Asansol", 23.6739, 86.9524],
  ["Kharagpur", 22.346, 87.2320],
  ["Visakhapatnam", 17.6868, 83.2185, "vizag"],
  ["Guntur", 16.3067, 80.4365],
  ["Nellore", 14.4426, 79.9865],
  ["Tirupati", 13.6288, 79.4192],
  ["Warangal", 17.9689, 79.5941],
  ["Nizamabad", 18.6725, 78.094],
  ["Karimnagar", 18.4386, 79.1288],
  ["Belagavi", 15.8497, 74.4977, "belgaum"],
  ["Mangaluru", 12.9141, 74.856, "mangalore"],
  ["Davanagere", 14.4644, 75.9218],
  ["Ballari", 15.1394, 76.9214, "bellary"],
  ["Salem", 11.6643, 78.146],
  ["Erode", 11.341, 77.7172],
  ["Vellore", 12.9165, 79.1325],
  ["Tirunelveli", 8.7139, 77.7567],
  ["Thanjavur", 10.787, 79.1378, "tanjore"],
  ["Puducherry", 11.9416, 79.8083, "pondicherry"],
  ["Kollam", 8.8932, 76.6141, "quilon"],
  ["Kannur", 11.8745, 75.3704, "cannanore"],
  ["Alappuzha", 9.4981, 76.3388, "alleppey"],
  ["Kottayam", 9.5916, 76.5222],
  ["Palakkad", 10.7867, 76.6548, "palghat"],
  ["Panaji", 15.4909, 73.8278, "goa", "panjim"],
  ["Margao", 15.2832, 73.9862, "madgaon"],
  ["Kolhapur", 16.705, 74.2433],
  ["Sangli", 16.8524, 74.5815],
  ["Amravati", 20.9374, 77.7796],
  ["Akola", 20.7002, 77.0082],
  ["Latur", 18.4088, 76.5604],
  ["Nanded", 19.1383, 77.321],
  ["Thane", 19.2183, 72.9781],
  ["Navi Mumbai", 19.033, 73.0297, "vashi"],
  ["Kalyan", 19.2437, 73.1355, "dombivli"],
  ["Vasai", 19.3919, 72.8397, "virar"],
  ["Bhiwandi", 19.2813, 73.0483],
  ["Ulhasnagar", 19.2215, 73.1645],
  ["Jamnagar", 22.4707, 70.0577],
  ["Bhavnagar", 21.7645, 72.1519],
  ["Junagadh", 21.5222, 70.4579],
  ["Gandhinagar", 23.2156, 72.6369],
  ["Anand", 22.5645, 72.9289],
  ["Bharuch", 21.7051, 72.9959],
  ["Navsari", 20.9467, 72.952],
  ["Ujjain", 23.1765, 75.7885],
  ["Sagar", 23.8388, 78.7378],
  ["Satna", 24.6005, 80.8322],
  ["Ratlam", 23.334, 75.0376],
  ["Rewa", 24.5362, 81.3037],
  ["Bilaspur", 22.0797, 82.1409],
  ["Korba", 22.3595, 82.7501],
  ["Durg", 21.1904, 81.2849, "bhilai"],
  ["Rourkela", 22.2604, 84.8536],
  ["Sambalpur", 21.4669, 83.9812],
  ["Berhampur", 19.3149, 84.7941, "brahmapur"],
  ["Puri", 19.8135, 85.8312],
  ["Imphal", 24.817, 93.9368],
  ["Shillong", 25.5788, 91.8933],
  ["Agartala", 23.8315, 91.2868],
  ["Aizawl", 23.7271, 92.7176],
  ["Kohima", 25.6751, 94.11],
  ["Itanagar", 27.0844, 93.6053],
  ["Gangtok", 27.3314, 88.6138],
  ["Dibrugarh", 27.4728, 94.912],
  ["Silchar", 24.8333, 92.7789],
  ["Jorhat", 26.7509, 94.2037],
  ["Patiala", 30.3398, 76.3869],
  ["Bathinda", 30.211, 74.9455],
  ["Pathankot", 32.2643, 75.6421],
  ["Hoshiarpur", 31.5143, 75.9115],
  ["Ambala", 30.3752, 76.7821],
  ["Panipat", 29.3909, 76.9635],
  ["Karnal", 29.6857, 76.9905],
  ["Hisar", 29.1492, 75.7217],
  ["Rohtak", 28.8955, 76.6066],
  ["Sonipat", 28.9931, 77.0151],
  ["Rewari", 28.1892, 76.6167],
  ["Hathras", 27.5954, 78.0522],
  ["Mainpuri", 27.2350, 79.0270],
  ["Budaun", 28.0289, 79.1213],
  ["Pilibhit", 28.6315, 79.8045],
  ["Lakhimpur", 27.9481, 80.7787, "lakhimpur kheri"],
  ["Banda", 25.4762, 80.3350],
  ["Chitrakoot", 25.2000, 80.9000],
  ["Fatehpur", 25.9304, 80.8130],
  ["Pratapgarh", 25.8973, 81.9463],
  ["Bulandshahr", 28.4069, 77.8498],
  ["Saharanpur", 29.968, 77.5552],
  ["Muzaffarnagar", 29.4727, 77.7085],
  ["Firozabad", 27.1592, 78.3957],
  ["Etawah", 26.7855, 79.0150],
  ["Rampur", 28.8154, 79.0250],
  ["Shahjahanpur", 27.8815, 79.9086],
  ["Farrukhabad", 27.3929, 79.5800],
  ["Mirzapur", 25.1337, 82.5644],
  ["Jaunpur", 25.7478, 82.6837],
  ["Azamgarh", 26.0685, 83.1836],
  ["Ballia", 25.7585, 84.1476],
  ["Deoria", 26.5024, 83.7791],
  ["Basti", 26.8140, 82.7635],
  ["Sultanpur", 26.2648, 82.0727],
  ["Raebareli", 26.2309, 81.2337],
  ["Unnao", 26.5393, 80.4878],
  ["Hardoi", 27.4166, 80.1123],
  ["Sitapur", 27.5619, 80.6636],
  ["Bahraich", 27.5743, 81.5941],
  ["Gonda", 27.1339, 81.9617],
  ["Nainital", 29.3919, 79.4542],
  ["Haldwani", 29.2183, 79.5130],
  ["Rishikesh", 30.0869, 78.2676],
  ["Roorkee", 29.8543, 77.888],
  ["Katra", 32.9917, 74.9319, "vaishno devi"],
  ["Leh", 34.1526, 77.5771],
  ["Port Blair", 11.6234, 92.7265],
];

/** Geographic centre of India — used only to say "we don't know", never silently. */
export const INDIA_FALLBACK: Place = {
  name: "India",
  lat: 22.9734,
  lon: 78.6569,
  tzOffsetMinutes: IST,
};

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves free text a user typed into a birth-place row. Returns null when
 * nothing matches — the caller must then drop the lagna, not fall back to a
 * default city, because a lagna from the wrong longitude is worse than no
 * lagna at all.
 */
export function resolvePlace(input?: string | null): Place | null {
  const q = slug(input ?? "");
  if (!q) return null;

  // Users type "Jaipur, Rajasthan" or "born in Kanpur (UP)" — try the whole
  // string first, then each comma/paren-separated part, longest part first so
  // "Navi Mumbai, Maharashtra" doesn't resolve on the state.
  const parts = [q, ...q.split(/[,()\-/]| in | near /).map(slug).filter(Boolean)]
    .sort((a, b) => b.length - a.length);

  for (const part of parts) {
    for (const entry of CITIES) {
      const [name, lat, lon, ...aliases] = entry;
      const names = [slug(name), ...aliases.map(slug)];
      if (names.includes(part)) {
        return { name, lat, lon, tzOffsetMinutes: IST };
      }
    }
  }

  // Second pass: substring, so "kanpur nagar" and "south delhi" still land.
  // Longest city name wins to keep "Navi Mumbai" from matching "Mumbai".
  let best: Place | null = null;
  for (const entry of CITIES) {
    const [name, lat, lon, ...aliases] = entry;
    for (const candidate of [slug(name), ...aliases.map(slug)]) {
      if (candidate.length >= 4 && q.includes(candidate)) {
        if (!best || candidate.length > best.name.length) {
          best = { name, lat, lon, tzOffsetMinutes: IST };
        }
      }
    }
  }
  return best;
}
