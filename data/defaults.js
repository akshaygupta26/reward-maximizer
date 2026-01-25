// Default point valuations and configuration data

const DEFAULT_POINT_VALUES = {
  // Chase Ultimate Rewards (cents per point)
  "chase-ur-csr": 1.50,        // Sapphire Reserve
  "chase-ur-csp": 1.25,        // Sapphire Preferred
  "chase-ur-cfu": 1.00,        // Freedom Unlimited
  "chase-ur-cff": 1.00,        // Freedom Flex
  "chase-ur-ink-preferred": 1.25,
  "chase-ur-ink-unlimited": 1.00,

  // Amex Membership Rewards (cents per point)
  "amex-mr-platinum": 1.10,
  "amex-mr-gold": 1.10,
  "amex-mr-green": 1.00,
  "amex-mr-bce": 1.00,         // Blue Cash Everyday (actual cash)
  "amex-mr-bcp": 1.00,         // Blue Cash Preferred (actual cash)
  "amex-mr-delta": 1.20,       // Delta cards
  "amex-mr-hilton": 0.50,      // Hilton cards (lower cpp)
  "amex-mr-marriott": 0.80,    // Marriott cards

  // Capital One Miles (cents per point)
  "capital-one-venture-x": 1.00,
  "capital-one-venture": 1.00,
  "capital-one-savor": 1.00,
  "capital-one-savor-one": 1.00,
  "capital-one-quicksilver": 1.00,

  // Citi ThankYou (cents per point)
  "citi-ty-premier": 1.00,
  "citi-ty-preferred": 1.00,
  "citi-ty-prestige": 1.00,
  "citi-double-cash": 1.00,
  "citi-custom-cash": 1.00,

  // Discover (cents per point - always cash back)
  "discover-it": 1.00,
  "discover-it-chrome": 1.00,

  // Bank of America (cents per point)
  "bofa-premium-rewards": 1.00,
  "bofa-customized-cash": 1.00,
  "bofa-unlimited-cash": 1.00,
  "bofa-travel-rewards": 1.00,

  // US Bank (cents per point)
  "usbank-altitude-reserve": 1.50,
  "usbank-altitude-go": 1.00,
  "usbank-cash+": 1.00,
  "usbank-flexperks": 1.00,

  // Stacking partners (actual cash value)
  "rakuten": 1.00,
  "capital-one-shopping": 1.00,
  "topcashback": 1.00,
  "retailmenot": 1.00
};

const CARD_PROGRAMS = {
  amex: {
    name: "American Express",
    shortName: "Amex",
    color: "#006FCF",
    cards: [
      { id: "amex-mr-platinum", name: "Platinum Card", rewardType: "mr" },
      { id: "amex-mr-gold", name: "Gold Card", rewardType: "mr" },
      { id: "amex-mr-green", name: "Green Card", rewardType: "mr" },
      { id: "amex-mr-bce", name: "Blue Cash Everyday", rewardType: "cash" },
      { id: "amex-mr-bcp", name: "Blue Cash Preferred", rewardType: "cash" },
      { id: "amex-mr-delta", name: "Delta Cards", rewardType: "miles" },
      { id: "amex-mr-hilton", name: "Hilton Cards", rewardType: "points" },
      { id: "amex-mr-marriott", name: "Marriott Cards", rewardType: "points" }
    ]
  },
  chase: {
    name: "Chase",
    shortName: "Chase",
    color: "#117ACA",
    cards: [
      { id: "chase-ur-csr", name: "Sapphire Reserve", rewardType: "ur" },
      { id: "chase-ur-csp", name: "Sapphire Preferred", rewardType: "ur" },
      { id: "chase-ur-cfu", name: "Freedom Unlimited", rewardType: "ur" },
      { id: "chase-ur-cff", name: "Freedom Flex", rewardType: "ur" },
      { id: "chase-ur-ink-preferred", name: "Ink Business Preferred", rewardType: "ur" },
      { id: "chase-ur-ink-unlimited", name: "Ink Business Unlimited", rewardType: "ur" }
    ]
  },
  citi: {
    name: "Citi",
    shortName: "Citi",
    color: "#003B70",
    cards: [
      { id: "citi-ty-premier", name: "Premier", rewardType: "ty" },
      { id: "citi-ty-preferred", name: "Preferred", rewardType: "ty" },
      { id: "citi-double-cash", name: "Double Cash", rewardType: "cash" },
      { id: "citi-custom-cash", name: "Custom Cash", rewardType: "cash" }
    ]
  },
  capitalOne: {
    name: "Capital One",
    shortName: "CapOne",
    color: "#D03027",
    cards: [
      { id: "capital-one-venture-x", name: "Venture X", rewardType: "miles" },
      { id: "capital-one-venture", name: "Venture", rewardType: "miles" },
      { id: "capital-one-savor", name: "Savor", rewardType: "cash" },
      { id: "capital-one-savor-one", name: "SavorOne", rewardType: "cash" },
      { id: "capital-one-quicksilver", name: "Quicksilver", rewardType: "cash" }
    ]
  },
  discover: {
    name: "Discover",
    shortName: "Discover",
    color: "#FF6600",
    cards: [
      { id: "discover-it", name: "Discover it", rewardType: "cash" },
      { id: "discover-it-chrome", name: "Discover it Chrome", rewardType: "cash" }
    ]
  },
  bofa: {
    name: "Bank of America",
    shortName: "BofA",
    color: "#012169",
    cards: [
      { id: "bofa-premium-rewards", name: "Premium Rewards", rewardType: "points" },
      { id: "bofa-customized-cash", name: "Customized Cash", rewardType: "cash" },
      { id: "bofa-unlimited-cash", name: "Unlimited Cash", rewardType: "cash" },
      { id: "bofa-travel-rewards", name: "Travel Rewards", rewardType: "points" }
    ]
  },
  usbank: {
    name: "US Bank",
    shortName: "US Bank",
    color: "#0C2340",
    cards: [
      { id: "usbank-altitude-reserve", name: "Altitude Reserve", rewardType: "points" },
      { id: "usbank-altitude-go", name: "Altitude Go", rewardType: "points" },
      { id: "usbank-cash+", name: "Cash+", rewardType: "cash" },
      { id: "usbank-flexperks", name: "FlexPerks", rewardType: "points" }
    ]
  }
};

const STACKING_PARTNERS = {
  rakuten: {
    name: "Rakuten",
    shortName: "Rakuten",
    color: "#BF0000",
    type: "portal",
    stackable: true
  },
  capitalOneShopping: {
    name: "Capital One Shopping",
    shortName: "CO Shopping",
    color: "#D03027",
    type: "extension",
    stackable: true
  },
  topcashback: {
    name: "TopCashback",
    shortName: "TopCashback",
    color: "#00B67A",
    type: "portal",
    stackable: true
  }
};

const MERCHANT_CATEGORIES = {
  dining: {
    name: "Dining",
    icon: "utensils",
    keywords: ["restaurant", "cafe", "coffee", "pizza", "burger", "food", "grill", "kitchen", "bistro", "diner", "bar", "pub", "steakhouse", "sushi", "taco", "mexican", "italian", "chinese", "thai", "indian", "doordash", "ubereats", "grubhub", "postmates"]
  },
  travel: {
    name: "Travel",
    icon: "plane",
    keywords: ["hotel", "airline", "flight", "airbnb", "vrbo", "marriott", "hilton", "hyatt", "ihg", "expedia", "booking", "kayak", "priceline", "united", "delta", "american airlines", "southwest", "jetblue", "alaska", "hertz", "avis", "enterprise", "national", "budget", "car rental", "cruise", "carnival", "royal caribbean"]
  },
  gas: {
    name: "Gas & Fuel",
    icon: "gas-pump",
    keywords: ["shell", "exxon", "mobil", "chevron", "bp", "texaco", "76", "sunoco", "speedway", "wawa", "sheetz", "quicktrip", "circle k", "gas", "fuel", "petro"]
  },
  grocery: {
    name: "Grocery",
    icon: "shopping-cart",
    keywords: ["walmart", "target", "kroger", "safeway", "publix", "albertsons", "whole foods", "trader joe", "aldi", "costco", "sam's club", "bj's", "grocery", "supermarket", "food lion", "wegmans", "h-e-b", "meijer", "instacart", "shipt", "fresh direct"]
  },
  shopping: {
    name: "Shopping",
    icon: "shopping-bag",
    keywords: ["amazon", "ebay", "walmart", "target", "best buy", "macy's", "nordstrom", "kohl's", "jcpenney", "sephora", "ulta", "nike", "adidas", "gap", "old navy", "h&m", "zara", "forever 21", "urban outfitters", "wayfair", "overstock", "etsy"]
  },
  entertainment: {
    name: "Entertainment",
    icon: "film",
    keywords: ["netflix", "hulu", "disney", "spotify", "apple music", "youtube", "hbo", "amc", "regal", "cinemark", "ticketmaster", "stubhub", "live nation", "playstation", "xbox", "nintendo", "steam", "twitch"]
  },
  homeImprovement: {
    name: "Home Improvement",
    icon: "home",
    keywords: ["home depot", "lowe's", "menards", "ace hardware", "true value", "harbor freight", "ikea", "bed bath", "williams sonoma", "pottery barn", "crate & barrel", "restoration hardware", "sherwin williams"]
  },
  electronics: {
    name: "Electronics",
    icon: "laptop",
    keywords: ["apple", "best buy", "microsoft", "dell", "hp", "lenovo", "samsung", "sony", "lg", "bose", "newegg", "b&h", "adorama", "micro center"]
  },
  other: {
    name: "Other",
    icon: "tag",
    keywords: []
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEFAULT_POINT_VALUES, CARD_PROGRAMS, STACKING_PARTNERS, MERCHANT_CATEGORIES };
}
