import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Search, CreditCard, Home, Tag, Settings, Layers, TrendingUp, Clock, Check, Star, Zap, Gift, DollarSign, Percent, ArrowUpRight, X, Filter } from 'lucide-react';

// Mock data based on actual plugin structure
const MOCK_OFFERS = [
  {
    id: 'rmx_1',
    merchant: 'Amazon',
    category: 'shopping',
    offers: [
      { source: 'amex', cardName: 'Amex Gold', value: '5% back', valueNum: 5, type: 'percent', expires: '2026-02-15' },
      { source: 'rakuten', cardName: 'Rakuten', value: '3% cash back', valueNum: 3, type: 'percent', expires: '2026-02-28' },
    ],
    stackable: true,
    totalValue: 8,
    logo: '📦'
  },
  {
    id: 'rmx_2',
    merchant: 'Uber Eats',
    category: 'dining',
    offers: [
      { source: 'chase', cardName: 'Sapphire Reserve', value: '10x points', valueNum: 15, type: 'points', expires: '2026-02-10' },
      { source: 'rakuten', cardName: 'Rakuten', value: '2.5% cash back', valueNum: 2.5, type: 'percent', expires: '2026-03-01' },
    ],
    stackable: true,
    totalValue: 17.5,
    logo: '🍔'
  },
  {
    id: 'rmx_3',
    merchant: 'Delta Airlines',
    category: 'travel',
    offers: [
      { source: 'amex', cardName: 'Amex Platinum', value: '5x MR points', valueNum: 5.5, type: 'points', expires: '2026-03-15' },
    ],
    stackable: false,
    totalValue: 5.5,
    logo: '✈️'
  },
  {
    id: 'rmx_4',
    merchant: 'Whole Foods',
    category: 'grocery',
    offers: [
      { source: 'amex', cardName: 'Amex Gold', value: '4x MR points', valueNum: 4.4, type: 'points', expires: '2026-02-20' },
      { source: 'chase', cardName: 'Freedom Flex', value: '3% back', valueNum: 3, type: 'percent', expires: '2026-02-28' },
    ],
    stackable: false,
    totalValue: 4.4,
    bestCard: 'Amex Gold',
    logo: '🥬'
  },
  {
    id: 'rmx_5',
    merchant: 'Best Buy',
    category: 'electronics',
    offers: [
      { source: 'chase', cardName: 'Freedom Unlimited', value: '5% back', valueNum: 5, type: 'percent', expires: '2026-02-18' },
      { source: 'bofa', cardName: 'Customized Cash', value: '3% back', valueNum: 3, type: 'percent', expires: '2026-02-25' },
      { source: 'rakuten', cardName: 'Rakuten', value: '2% cash back', valueNum: 2, type: 'percent', expires: '2026-03-05' },
    ],
    stackable: true,
    totalValue: 7,
    logo: '🖥️'
  },
  {
    id: 'rmx_6',
    merchant: 'Shell Gas',
    category: 'gas',
    offers: [
      { source: 'chase', cardName: 'Freedom Flex', value: '5% back', valueNum: 5, type: 'percent', expires: '2026-03-31' },
    ],
    stackable: false,
    totalValue: 5,
    logo: '⛽'
  },
  {
    id: 'rmx_7',
    merchant: 'Nike',
    category: 'shopping',
    offers: [
      { source: 'amex', cardName: 'Amex Platinum', value: '$50 off $200', valueNum: 25, type: 'fixed', expires: '2026-02-14' },
      { source: 'rakuten', cardName: 'Rakuten', value: '8% cash back', valueNum: 8, type: 'percent', expires: '2026-02-28' },
    ],
    stackable: true,
    totalValue: 33,
    logo: '👟'
  },
  {
    id: 'rmx_8',
    merchant: 'Marriott',
    category: 'travel',
    offers: [
      { source: 'amex', cardName: 'Marriott Bonvoy', value: '6x points', valueNum: 4.8, type: 'points', expires: '2026-04-01' },
      { source: 'chase', cardName: 'Sapphire Preferred', value: '3x UR points', valueNum: 3.75, type: 'points', expires: '2026-03-15' },
      { source: 'rakuten', cardName: 'Rakuten', value: '3% cash back', valueNum: 3, type: 'percent', expires: '2026-03-01' },
    ],
    stackable: true,
    totalValue: 7.8,
    logo: '🏨'
  },
  {
    id: 'rmx_9',
    merchant: 'Starbucks',
    category: 'dining',
    offers: [
      { source: 'amex', cardName: 'Amex Gold', value: '4x MR points', valueNum: 4.4, type: 'points', expires: '2026-02-28' },
    ],
    stackable: false,
    totalValue: 4.4,
    logo: '☕'
  },
  {
    id: 'rmx_10',
    merchant: 'Home Depot',
    category: 'homeImprovement',
    offers: [
      { source: 'bofa', cardName: 'Customized Cash', value: '5.25% back', valueNum: 5.25, type: 'percent', expires: '2026-03-31' },
      { source: 'rakuten', cardName: 'Rakuten', value: '1.5% cash back', valueNum: 1.5, type: 'percent', expires: '2026-02-28' },
    ],
    stackable: true,
    totalValue: 6.75,
    logo: '🔨'
  },
];

const MOCK_CARDS = [
  { id: 'amex-gold', name: 'Amex Gold', issuer: 'amex', color: '#B4975A', lastSync: '2 hours ago', offerCount: 47 },
  { id: 'chase-csr', name: 'Sapphire Reserve', issuer: 'chase', color: '#1A1F71', lastSync: '3 hours ago', offerCount: 32 },
  { id: 'chase-cff', name: 'Freedom Flex', issuer: 'chase', color: '#117ACA', lastSync: '3 hours ago', offerCount: 28 },
  { id: 'bofa-custom', name: 'Customized Cash', issuer: 'bofa', color: '#012169', lastSync: '5 hours ago', offerCount: 19 },
  { id: 'rakuten', name: 'Rakuten', issuer: 'rakuten', color: '#BF0000', lastSync: '1 hour ago', offerCount: 156 },
];

const CATEGORIES = [
  { id: 'all', name: 'All', icon: Tag },
  { id: 'stackable', name: 'Stackable', icon: Layers },
  { id: 'dining', name: 'Dining', icon: '🍽️' },
  { id: 'travel', name: 'Travel', icon: '✈️' },
  { id: 'shopping', name: 'Shopping', icon: '🛍️' },
  { id: 'grocery', name: 'Grocery', icon: '🛒' },
  { id: 'gas', name: 'Gas', icon: '⛽' },
];

const SOURCE_COLORS = {
  amex: '#006FCF',
  chase: '#117ACA',
  bofa: '#012169',
  usbank: '#0C2340',
  citi: '#003B70',
  discover: '#FF6600',
  'capital-one': '#D03027',
  rakuten: '#BF0000',
};

// Stacking Explanation Component
const StackingExplainer = ({ onClose }) => (
  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center animate-fadeIn">
    <div className="bg-gradient-to-b from-[#1a1a2e] to-[#0d0d0d] rounded-t-3xl w-full max-w-md p-6 animate-slideUp">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white">How Stacking Works</h2>
        <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20">
          <X size={20} className="text-white" />
        </button>
      </div>

      <div className="space-y-4">
        <div className="bg-white/5 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <span className="text-xl">1️⃣</span>
            </div>
            <div>
              <p className="text-white font-medium">Credit Card Offer</p>
              <p className="text-gray-400 text-sm">e.g., 5% back at Amazon with Amex</p>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
            <span className="text-white font-bold">+</span>
          </div>
        </div>

        <div className="bg-white/5 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-xl">2️⃣</span>
            </div>
            <div>
              <p className="text-white font-medium">Cashback Portal</p>
              <p className="text-gray-400 text-sm">e.g., 3% via Rakuten</p>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
            <span className="text-white font-bold">=</span>
          </div>
        </div>

        <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-2xl p-4 border border-green-500/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
              <Zap size={20} className="text-white" />
            </div>
            <div>
              <p className="text-green-400 font-bold text-lg">8% Total Rewards!</p>
              <p className="text-gray-400 text-sm">Rewards stack for maximum savings</p>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={onClose}
        className="w-full mt-6 py-4 bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl text-white font-semibold"
      >
        Got it!
      </button>
    </div>
  </div>
);

// Offer Detail Modal
const OfferDetail = ({ offer, onClose }) => {
  const cardOffers = offer.offers.filter(o => o.source !== 'rakuten');
  const portalOffers = offer.offers.filter(o => o.source === 'rakuten');

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center animate-fadeIn">
      <div className="bg-gradient-to-b from-[#1a1a2e] to-[#0d0d0d] rounded-t-3xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-slideUp">
        <div className="sticky top-0 bg-gradient-to-b from-[#1a1a2e] to-transparent p-6 pb-2">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-3xl">
                {offer.logo}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{offer.merchant}</h2>
                <p className="text-gray-400 capitalize">{offer.category}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20">
              <X size={20} className="text-white" />
            </button>
          </div>
        </div>

        <div className="p-6 pt-2 space-y-6">
          {/* Total Value Banner */}
          {offer.stackable && (
            <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-2xl p-4 border border-green-500/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                    <Layers size={24} className="text-white" />
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Combined Stack Value</p>
                    <p className="text-green-400 font-bold text-2xl">{offer.totalValue}% back</p>
                  </div>
                </div>
                <div className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  STACKABLE
                </div>
              </div>
            </div>
          )}

          {/* Card Offers */}
          <div>
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <CreditCard size={18} /> Credit Card Offers
            </h3>
            <div className="space-y-3">
              {cardOffers.map((o, idx) => (
                <div key={idx} className="bg-white/5 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs"
                      style={{ backgroundColor: SOURCE_COLORS[o.source] }}
                    >
                      {o.source.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white font-medium">{o.cardName}</p>
                      <p className="text-gray-500 text-sm">Expires {new Date(o.expires).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-green-400 font-bold">{o.value}</p>
                    <p className="text-gray-500 text-xs">≈ {o.valueNum}% value</p>
                  </div>
                </div>
              ))}
              {cardOffers.length === 0 && (
                <p className="text-gray-500 text-sm">No card offers available</p>
              )}
            </div>
          </div>

          {/* Portal Offers (Stackable) */}
          {portalOffers.length > 0 && (
            <div>
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <Gift size={18} />
                Cashback Portals
                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">+ STACKABLE</span>
              </h3>
              <div className="space-y-3">
                {portalOffers.map((o, idx) => (
                  <div key={idx} className="bg-gradient-to-r from-red-500/10 to-transparent rounded-xl p-4 flex items-center justify-between border border-red-500/20">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs"
                        style={{ backgroundColor: SOURCE_COLORS[o.source] }}
                      >
                        R
                      </div>
                      <div>
                        <p className="text-white font-medium">{o.cardName}</p>
                        <p className="text-gray-500 text-sm">Activate before purchase</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-green-400 font-bold">+{o.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stacking Breakdown */}
          {offer.stackable && (
            <div className="bg-white/5 rounded-2xl p-4">
              <h3 className="text-white font-semibold mb-3">💡 How to maximize</h3>
              <ol className="space-y-2 text-gray-400 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-green-400 font-bold">1.</span>
                  Activate Rakuten before shopping
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 font-bold">2.</span>
                  Pay with {cardOffers[0]?.cardName || 'your best card'}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 font-bold">3.</span>
                  Earn {offer.totalValue}% combined rewards!
                </li>
              </ol>
            </div>
          )}

          <button className="w-full py-4 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl text-white font-semibold flex items-center justify-center gap-2">
            Shop at {offer.merchant}
            <ArrowUpRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

// Offer Card Component
const OfferCard = ({ offer, onClick }) => {
  const bestOffer = offer.offers.reduce((best, curr) =>
    curr.valueNum > best.valueNum ? curr : best
  , offer.offers[0]);

  return (
    <div
      onClick={onClick}
      className="bg-gradient-to-br from-white/10 to-white/5 rounded-2xl p-4 cursor-pointer hover:from-white/15 hover:to-white/10 transition-all active:scale-98"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl">
            {offer.logo}
          </div>
          <div>
            <h3 className="text-white font-semibold">{offer.merchant}</h3>
            <p className="text-gray-500 text-sm capitalize">{offer.category}</p>
          </div>
        </div>
        <ChevronRight size={20} className="text-gray-500" />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {offer.stackable ? (
            <div className="flex items-center gap-1 bg-green-500/20 text-green-400 text-xs font-semibold px-2 py-1 rounded-full">
              <Layers size={12} />
              {offer.offers.length} STACKABLE
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {offer.offers.slice(0, 3).map((o, idx) => (
                <div
                  key={idx}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: SOURCE_COLORS[o.source], marginLeft: idx > 0 ? -8 : 0 }}
                >
                  {o.source.slice(0, 1).toUpperCase()}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="text-green-400 font-bold text-lg">
            {offer.stackable ? `${offer.totalValue}%` : bestOffer.value}
          </p>
          {offer.stackable && (
            <p className="text-gray-500 text-xs">combined</p>
          )}
        </div>
      </div>
    </div>
  );
};

// Home Screen
const HomeScreen = ({ offers, onViewOffer, onShowStacking }) => {
  const stackableOffers = offers.filter(o => o.stackable).sort((a, b) => b.totalValue - a.totalValue);
  const topOffers = [...offers].sort((a, b) => b.totalValue - a.totalValue).slice(0, 5);
  const totalSavings = offers.reduce((sum, o) => sum + o.totalValue, 0);

  return (
    <div className="pb-24 space-y-6">
      {/* Header Stats */}
      <div className="bg-gradient-to-br from-green-500/20 via-emerald-500/10 to-transparent rounded-3xl p-6">
        <p className="text-gray-400 text-sm mb-1">Total Reward Potential</p>
        <h1 className="text-4xl font-bold text-white mb-4">
          <span className="text-green-400">{offers.length}</span> Active Offers
        </h1>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-green-400 mb-1">
              <Layers size={16} />
              <span className="text-sm font-medium">Stackable</span>
            </div>
            <p className="text-2xl font-bold text-white">{stackableOffers.length}</p>
          </div>
          <div className="bg-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-blue-400 mb-1">
              <CreditCard size={16} />
              <span className="text-sm font-medium">Cards Synced</span>
            </div>
            <p className="text-2xl font-bold text-white">{MOCK_CARDS.length}</p>
          </div>
        </div>
      </div>

      {/* Stacking CTA */}
      <button
        onClick={onShowStacking}
        className="w-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-2xl p-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Zap size={24} className="text-white" />
          </div>
          <div className="text-left">
            <p className="text-white font-semibold">Stack for More Rewards</p>
            <p className="text-gray-400 text-sm">Learn how to combine offers</p>
          </div>
        </div>
        <ChevronRight className="text-gray-400" />
      </button>

      {/* Top Stacked Deals */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <Layers size={20} className="text-green-400" />
            Top Stacked Deals
          </h2>
          <button className="text-blue-400 text-sm font-medium">See All</button>
        </div>
        <div className="space-y-3">
          {stackableOffers.slice(0, 3).map(offer => (
            <OfferCard key={offer.id} offer={offer} onClick={() => onViewOffer(offer)} />
          ))}
        </div>
      </div>

      {/* Expiring Soon */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <Clock size={20} className="text-orange-400" />
            Expiring Soon
          </h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
          {topOffers.slice(0, 4).map(offer => (
            <div
              key={offer.id}
              onClick={() => onViewOffer(offer)}
              className="min-w-[140px] bg-white/5 rounded-2xl p-4 cursor-pointer hover:bg-white/10 transition-all"
            >
              <div className="text-3xl mb-2">{offer.logo}</div>
              <p className="text-white font-medium text-sm truncate">{offer.merchant}</p>
              <p className="text-green-400 font-bold">{offer.totalValue}%</p>
              <p className="text-gray-500 text-xs mt-1">Ends Feb 15</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Offers Screen
const OffersScreen = ({ offers, onViewOffer }) => {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const filteredOffers = offers.filter(offer => {
    const matchesSearch = offer.merchant.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = activeFilter === 'all' ||
                         (activeFilter === 'stackable' && offer.stackable) ||
                         offer.category === activeFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="pb-24 space-y-4">
      {/* Search */}
      <div className="relative">
        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="Search merchants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Category Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveFilter(cat.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-all ${
              activeFilter === cat.id
                ? 'bg-blue-500 text-white'
                : 'bg-white/10 text-gray-400 hover:bg-white/20'
            }`}
          >
            {typeof cat.icon === 'string' ? (
              <span>{cat.icon}</span>
            ) : (
              <cat.icon size={16} />
            )}
            {cat.name}
            {cat.id === 'stackable' && (
              <span className="bg-green-500 text-white text-xs px-1.5 rounded-full">
                {offers.filter(o => o.stackable).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-sm">{filteredOffers.length} offers</p>
        <button className="flex items-center gap-1 text-gray-400 text-sm">
          <Filter size={14} />
          Sort
        </button>
      </div>

      {/* Offer List */}
      <div className="space-y-3">
        {filteredOffers.map(offer => (
          <OfferCard key={offer.id} offer={offer} onClick={() => onViewOffer(offer)} />
        ))}
      </div>
    </div>
  );
};

// Cards Screen
const CardsScreen = () => {
  return (
    <div className="pb-24 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">My Cards</h1>
        <button className="bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium">
          + Add Card
        </button>
      </div>

      {/* Sync Status */}
      <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
          <Check size={20} className="text-white" />
        </div>
        <div>
          <p className="text-white font-medium">All cards synced</p>
          <p className="text-gray-400 text-sm">Last synced via Chrome extension</p>
        </div>
      </div>

      {/* Cards List */}
      <div className="space-y-4">
        {MOCK_CARDS.map(card => (
          <div
            key={card.id}
            className="bg-gradient-to-br from-white/10 to-white/5 rounded-2xl p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-8 rounded-lg"
                  style={{ backgroundColor: card.color }}
                />
                <div>
                  <p className="text-white font-semibold">{card.name}</p>
                  <p className="text-gray-500 text-sm capitalize">{card.issuer}</p>
                </div>
              </div>
              <ChevronRight className="text-gray-500" />
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1 text-gray-400">
                <Clock size={14} />
                Synced {card.lastSync}
              </div>
              <div className="text-green-400 font-medium">
                {card.offerCount} offers
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stacking Partners */}
      <div>
        <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
          <Layers size={20} className="text-purple-400" />
          Stacking Partners
        </h2>
        <div className="bg-white/5 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#BF0000] flex items-center justify-center text-white font-bold">
                R
              </div>
              <div>
                <p className="text-white font-medium">Rakuten</p>
                <p className="text-gray-500 text-sm">156 active offers</p>
              </div>
            </div>
            <div className="bg-green-500/20 text-green-400 text-xs font-semibold px-2 py-1 rounded-full">
              CONNECTED
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Settings Screen
const SettingsScreen = () => {
  return (
    <div className="pb-24 space-y-6">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      <div className="space-y-4">
        <div className="bg-white/5 rounded-2xl overflow-hidden">
          <button className="w-full p-4 flex items-center justify-between hover:bg-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <DollarSign size={20} className="text-blue-400" />
              </div>
              <span className="text-white">Point Valuations</span>
            </div>
            <ChevronRight className="text-gray-500" />
          </button>
          <div className="h-px bg-white/10" />
          <button className="w-full p-4 flex items-center justify-between hover:bg-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Tag size={20} className="text-purple-400" />
              </div>
              <span className="text-white">Categories</span>
            </div>
            <ChevronRight className="text-gray-500" />
          </button>
          <div className="h-px bg-white/10" />
          <button className="w-full p-4 flex items-center justify-between hover:bg-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <TrendingUp size={20} className="text-green-400" />
              </div>
              <span className="text-white">Notifications</span>
            </div>
            <ChevronRight className="text-gray-500" />
          </button>
        </div>

        <div className="bg-white/5 rounded-2xl p-4">
          <h3 className="text-white font-semibold mb-3">Sync with Extension</h3>
          <p className="text-gray-400 text-sm mb-4">
            Connect your Chrome extension to automatically sync offers to this app.
          </p>
          <button className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl text-white font-medium">
            Generate Sync Code
          </button>
        </div>

        <div className="bg-white/5 rounded-2xl p-4">
          <p className="text-gray-500 text-sm text-center">
            Reward Maximizer v2.0.0
          </p>
        </div>
      </div>
    </div>
  );
};

// Main App Component
export default function RewardMaximizerApp() {
  const [activeTab, setActiveTab] = useState('home');
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [showStacking, setShowStacking] = useState(false);

  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'offers', label: 'Offers', icon: Tag },
    { id: 'cards', label: 'Cards', icon: CreditCard },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* iPhone Frame */}
      <div className="max-w-md mx-auto min-h-screen bg-gradient-to-b from-[#0d0d0d] to-[#0a0a0a] relative">
        {/* Status Bar */}
        <div className="sticky top-0 z-40 bg-[#0d0d0d]/80 backdrop-blur-xl">
          <div className="flex items-center justify-between px-6 py-3">
            <span className="text-sm font-medium">9:41</span>
            <div className="flex items-center gap-1">
              <div className="flex gap-0.5">
                <div className="w-1 h-2 bg-white rounded-full" />
                <div className="w-1 h-3 bg-white rounded-full" />
                <div className="w-1 h-4 bg-white rounded-full" />
                <div className="w-1 h-3 bg-white/50 rounded-full" />
              </div>
              <span className="text-sm ml-1">5G</span>
              <div className="w-6 h-3 border border-white rounded-sm ml-1 relative">
                <div className="absolute inset-0.5 bg-green-500 rounded-sm" style={{ width: '80%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 pt-2">
          {activeTab === 'home' && (
            <HomeScreen
              offers={MOCK_OFFERS}
              onViewOffer={setSelectedOffer}
              onShowStacking={() => setShowStacking(true)}
            />
          )}
          {activeTab === 'offers' && (
            <OffersScreen
              offers={MOCK_OFFERS}
              onViewOffer={setSelectedOffer}
            />
          )}
          {activeTab === 'cards' && <CardsScreen />}
          {activeTab === 'settings' && <SettingsScreen />}
        </div>

        {/* Tab Bar */}
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-[#0d0d0d]/90 backdrop-blur-xl border-t border-white/10">
          <div className="flex items-center justify-around py-2 pb-6">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-1 px-4 py-2 transition-all ${
                  activeTab === tab.id ? 'text-blue-400' : 'text-gray-500'
                }`}
              >
                <tab.icon size={24} />
                <span className="text-xs">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Modals */}
        {selectedOffer && (
          <OfferDetail offer={selectedOffer} onClose={() => setSelectedOffer(null)} />
        )}
        {showStacking && (
          <StackingExplainer onClose={() => setShowStacking(false)} />
        )}
      </div>

      {/* Custom Styles */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
        .active\\:scale-98:active { transform: scale(0.98); }

        /* Hide scrollbar but keep functionality */
        ::-webkit-scrollbar { display: none; }
        * { scrollbar-width: none; }
      `}</style>
    </div>
  );
}
