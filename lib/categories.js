// Merchant category detection and management

const Categories = {
  // Category definitions with keywords for matching
  definitions: {
    dining: {
      name: "Dining",
      icon: "utensils",
      keywords: [
        "restaurant", "cafe", "coffee", "pizza", "burger", "food", "grill",
        "kitchen", "bistro", "diner", "bar", "pub", "steakhouse", "sushi",
        "taco", "mexican", "italian", "chinese", "thai", "indian", "doordash",
        "ubereats", "uber eats", "grubhub", "postmates", "seamless", "caviar",
        "chipotle", "mcdonald", "wendy", "taco bell", "burger king", "subway",
        "starbucks", "dunkin", "panera", "chick-fil-a", "olive garden",
        "applebee", "chili's", "outback", "red lobster", "domino", "papa john",
        "shake shack", "five guys", "wingstop", "buffalo wild wings", "ihop",
        "denny's", "waffle house", "cracker barrel", "texas roadhouse"
      ]
    },
    travel: {
      name: "Travel",
      icon: "plane",
      keywords: [
        "hotel", "airline", "flight", "airbnb", "vrbo", "marriott", "hilton",
        "hyatt", "ihg", "expedia", "booking", "kayak", "priceline", "united",
        "delta", "american airlines", "southwest", "jetblue", "alaska",
        "hertz", "avis", "enterprise", "national", "budget", "car rental",
        "cruise", "carnival", "royal caribbean", "norwegian", "princess",
        "hotels.com", "trivago", "hotwire", "orbitz", "travelocity", "agoda",
        "choice hotels", "wyndham", "best western", "radisson", "sheraton",
        "westin", "ritz carlton", "four seasons", "intercontinental", "holiday inn",
        "hampton inn", "courtyard", "fairfield inn", "residence inn", "spirit",
        "frontier", "allegiant", "hawaiian airlines", "lufthansa", "british airways",
        "air france", "emirates", "qatar", "singapore airlines", "turo", "getaround"
      ]
    },
    gas: {
      name: "Gas & Fuel",
      icon: "gas-pump",
      keywords: [
        "shell", "exxon", "mobil", "chevron", "bp", "texaco", "76", "sunoco",
        "speedway", "wawa", "sheetz", "quicktrip", "qt", "circle k", "gas",
        "fuel", "petro", "marathon", "valero", "phillips 66", "conoco",
        "sinclair", "murphy usa", "costco gas", "sam's club gas", "buc-ee's",
        "casey's", "racetrac", "pilot", "flying j", "love's", "ta", "petro canada"
      ]
    },
    grocery: {
      name: "Grocery",
      icon: "shopping-cart",
      keywords: [
        "walmart grocery", "target grocery", "kroger", "safeway", "publix",
        "albertsons", "whole foods", "trader joe", "aldi", "costco", "sam's club",
        "bj's", "grocery", "supermarket", "food lion", "wegmans", "h-e-b",
        "meijer", "instacart", "shipt", "fresh direct", "peapod", "vons",
        "ralphs", "giant", "stop & shop", "shoprite", "price chopper",
        "hannaford", "market basket", "hy-vee", "schnucks", "jewel-osco",
        "acme", "harris teeter", "sprouts", "natural grocers", "fresh market",
        "piggly wiggly", "winn-dixie", "bi-lo", "fry's", "smith's", "king soopers"
      ]
    },
    shopping: {
      name: "Shopping",
      icon: "shopping-bag",
      keywords: [
        "amazon", "ebay", "walmart", "target", "best buy", "macy's", "nordstrom",
        "kohl's", "jcpenney", "jc penney", "sephora", "ulta", "nike", "adidas",
        "gap", "old navy", "h&m", "zara", "forever 21", "urban outfitters",
        "wayfair", "overstock", "etsy", "wish", "aliexpress", "newegg",
        "zappos", "dsw", "foot locker", "finish line", "dick's", "rei",
        "bass pro", "cabela's", "academy", "michaels", "joann", "hobby lobby",
        "bed bath", "bb&b", "container store", "pier 1", "world market",
        "anthropologie", "free people", "asos", "shein", "fashion nova",
        "revolve", "bloomingdale's", "saks", "neiman marcus", "banana republic",
        "express", "loft", "ann taylor", "j.crew", "j crew", "lands' end",
        "ll bean", "vineyard vines", "brooks brothers", "tommy hilfiger",
        "calvin klein", "ralph lauren", "coach", "kate spade", "michael kors"
      ]
    },
    entertainment: {
      name: "Entertainment",
      icon: "film",
      keywords: [
        "netflix", "hulu", "disney", "disney+", "spotify", "apple music",
        "youtube", "hbo", "hbo max", "amc", "regal", "cinemark", "ticketmaster",
        "stubhub", "live nation", "playstation", "xbox", "nintendo", "steam",
        "twitch", "paramount+", "peacock", "espn", "sling", "fubo", "dazn",
        "fandango", "atom tickets", "gamestop", "amazon prime video",
        "apple tv", "audible", "kindle", "sirius xm", "pandora", "tidal",
        "deezer", "soundcloud", "crunchyroll", "funimation", "discord",
        "six flags", "cedar point", "universal", "seaworld", "legoland",
        "dave & buster's", "main event", "topgolf", "bowlero", "round1"
      ]
    },
    homeImprovement: {
      name: "Home Improvement",
      icon: "home",
      keywords: [
        "home depot", "lowe's", "menards", "ace hardware", "true value",
        "harbor freight", "ikea", "bed bath & beyond", "williams sonoma",
        "pottery barn", "crate & barrel", "crate and barrel", "restoration hardware",
        "rh", "sherwin williams", "benjamin moore", "floor & decor",
        "lumber liquidators", "tile shop", "build.com", "build com",
        "ferguson", "plumbing supply", "electrical supply", "hvac",
        "blinds.com", "wayfair", "overstock", "houzz", "article", "joybird",
        "west elm", "cb2", "room & board", "ethan allen", "la-z-boy",
        "ashley furniture", "rooms to go", "living spaces", "mattress firm",
        "casper", "purple", "tuft & needle", "leesa", "saatva"
      ]
    },
    electronics: {
      name: "Electronics",
      icon: "laptop",
      keywords: [
        "apple", "best buy", "microsoft", "dell", "hp", "lenovo", "samsung",
        "sony", "lg", "bose", "newegg", "b&h", "b and h", "adorama",
        "micro center", "fry's electronics", "monoprice", "anker", "belkin",
        "logitech", "razer", "corsair", "nvidia", "amd", "intel", "asus",
        "msi", "gigabyte", "acer", "google store", "oculus", "meta quest",
        "gopro", "dji", "canon", "nikon", "fujifilm", "sony alpha",
        "bose", "sonos", "harman kardon", "jbl", "beats", "sennheiser",
        "audio technica", "shure", "blue yeti", "elgato", "ring", "nest",
        "ecobee", "philips hue", "lutron", "wemo", "tp-link", "ubiquiti"
      ]
    },
    streaming: {
      name: "Streaming",
      icon: "play-circle",
      keywords: [
        "netflix", "hulu", "disney+", "disney plus", "hbo max", "max",
        "amazon prime", "apple tv+", "apple tv plus", "paramount+",
        "paramount plus", "peacock", "espn+", "espn plus", "youtube premium",
        "youtube tv", "sling tv", "fubo", "philo", "discovery+", "discovery plus",
        "showtime", "starz", "epix", "mgm+", "bet+", "amc+", "britbox",
        "acorn tv", "shudder", "criterion channel", "mubi", "kanopy"
      ]
    },
    subscription: {
      name: "Subscriptions",
      icon: "repeat",
      keywords: [
        "amazon prime", "costco membership", "sam's club membership",
        "aaa", "gym", "fitness", "planet fitness", "la fitness", "equinox",
        "lifetime fitness", "anytime fitness", "gold's gym", "crossfit",
        "orangetheory", "peloton", "classpass", "barre3", "pure barre",
        "blue apron", "hello fresh", "home chef", "factor", "freshly",
        "daily harvest", "thrive market", "imperfect foods", "misfits market",
        "butcher box", "omaha steaks", "wine club", "beer subscription",
        "bark box", "chewy", "stitch fix", "rent the runway", "nuuly",
        "fabletics", "dollar shave club", "harry's", "billie", "quip"
      ]
    },
    other: {
      name: "Other",
      icon: "tag",
      keywords: []
    }
  },

  // Detect category from merchant name
  detectCategory(merchantName) {
    if (!merchantName) return 'other';

    const lowerName = merchantName.toLowerCase();

    for (const [categoryId, category] of Object.entries(this.definitions)) {
      if (categoryId === 'other') continue;

      for (const keyword of category.keywords) {
        if (lowerName.includes(keyword.toLowerCase())) {
          return categoryId;
        }
      }
    }

    return 'other';
  },

  // Get category info
  getCategory(categoryId) {
    return this.definitions[categoryId] || this.definitions.other;
  },

  // Get all categories
  getAllCategories() {
    return Object.entries(this.definitions).map(([id, cat]) => ({
      id,
      ...cat
    }));
  },

  // Group offers by category
  groupByCategory(offers) {
    const groups = {};

    for (const offer of offers) {
      const category = offer.merchantCategory || this.detectCategory(offer.merchant);
      if (!groups[category]) {
        groups[category] = {
          ...this.getCategory(category),
          id: category,
          offers: []
        };
      }
      groups[category].offers.push(offer);
    }

    return groups;
  },

  // Group offers by merchant (for stacking view)
  groupByMerchant(offers) {
    const groups = {};

    for (const offer of offers) {
      const merchantKey = offer.merchant.toLowerCase().trim();
      if (!groups[merchantKey]) {
        groups[merchantKey] = {
          merchant: offer.merchant,
          category: offer.merchantCategory || this.detectCategory(offer.merchant),
          offers: []
        };
      }
      groups[merchantKey].offers.push(offer);
    }

    return groups;
  },

  // Group offers by source (card issuer)
  groupBySource(offers) {
    const groups = {};

    for (const offer of offers) {
      if (!groups[offer.source]) {
        groups[offer.source] = {
          source: offer.source,
          offers: []
        };
      }
      groups[offer.source].offers.push(offer);
    }

    return groups;
  },

  // Find merchants with offers from multiple sources (stacking opportunities)
  findStackingOpportunities(offers) {
    const merchantGroups = this.groupByMerchant(offers);
    const opportunities = [];

    for (const [merchantKey, group] of Object.entries(merchantGroups)) {
      // Check if has both card offer and stacking partner
      const hasCardOffer = group.offers.some(o =>
        !['rakuten', 'capital-one-shopping', 'topcashback'].includes(o.source)
      );
      const hasStackingPartner = group.offers.some(o =>
        ['rakuten', 'capital-one-shopping', 'topcashback'].includes(o.source)
      );

      if (hasCardOffer && hasStackingPartner) {
        opportunities.push({
          merchant: group.merchant,
          category: group.category,
          offers: group.offers,
          stackable: true
        });
      } else if (group.offers.length > 1) {
        // Multiple card offers for same merchant
        opportunities.push({
          merchant: group.merchant,
          category: group.category,
          offers: group.offers,
          stackable: false,
          multipleOptions: true
        });
      }
    }

    return opportunities;
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Categories };
}
