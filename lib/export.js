// Export utilities for CSV and JSON export

const ExportUtils = {
  // Convert offers to CSV format
  toCSV(offers, options = {}) {
    const {
      includeHeader = true,
      delimiter = ',',
      dateFormat = 'iso' // 'iso' or 'readable'
    } = options;

    const headers = [
      'Merchant',
      'Card/Source',
      'Offer Value',
      'Category',
      'Expiry Date',
      'Opted In Date',
      'Status',
      'Value Per Dollar'
    ];

    const rows = offers.map(offer => {
      const optedIn = this.formatDate(offer.optedInAt, dateFormat);
      const expiry = this.formatDate(offer.expiry, dateFormat);

      return [
        this.escapeCSV(offer.merchant),
        this.escapeCSV(this.formatSource(offer.source)),
        this.escapeCSV(offer.value),
        this.escapeCSV(offer.merchantCategory || 'Other'),
        this.escapeCSV(expiry),
        this.escapeCSV(optedIn),
        this.escapeCSV(offer.status || 'active'),
        offer.calculatedValue ? `$${offer.calculatedValue.toFixed(4)}` : 'N/A'
      ];
    });

    const csvRows = [];
    if (includeHeader) {
      csvRows.push(headers.join(delimiter));
    }
    rows.forEach(row => {
      csvRows.push(row.join(delimiter));
    });

    return csvRows.join('\n');
  },

  // Escape CSV field
  escapeCSV(field) {
    if (field === null || field === undefined) return '';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  },

  // Format date
  formatDate(dateStr, format = 'iso') {
    if (!dateStr || dateStr === 'Check Portal' || dateStr === 'Check portal') {
      return 'Not specified';
    }

    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;

      if (format === 'readable') {
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      }
      return date.toISOString().split('T')[0];
    } catch {
      return dateStr;
    }
  },

  // Format source for display
  formatSource(source) {
    const sourceNames = {
      'amex': 'American Express',
      'chase': 'Chase',
      'citi': 'Citi',
      'capital-one': 'Capital One',
      'discover': 'Discover',
      'bofa': 'Bank of America',
      'usbank': 'US Bank',
      'rakuten': 'Rakuten',
      'capital-one-shopping': 'Capital One Shopping',
      'topcashback': 'TopCashback'
    };
    return sourceNames[source] || source;
  },

  // Convert offers to JSON format
  toJSON(offers, options = {}) {
    const { pretty = true } = options;

    const exportData = {
      exportedAt: new Date().toISOString(),
      totalOffers: offers.length,
      offers: offers.map(offer => ({
        id: offer.id,
        merchant: offer.merchant,
        source: offer.source,
        sourceName: this.formatSource(offer.source),
        value: offer.value,
        valueType: offer.valueType,
        valueAmount: offer.valueAmount,
        category: offer.merchantCategory || 'other',
        expiry: offer.expiry,
        optedInAt: offer.optedInAt,
        status: offer.status,
        calculatedValue: offer.calculatedValue
      }))
    };

    return pretty
      ? JSON.stringify(exportData, null, 2)
      : JSON.stringify(exportData);
  },

  // Generate summary statistics
  generateSummary(offers) {
    const bySource = {};
    const byCategory = {};
    const byStatus = { active: 0, expired: 0, used: 0 };

    for (const offer of offers) {
      // Count by source
      bySource[offer.source] = (bySource[offer.source] || 0) + 1;

      // Count by category
      const cat = offer.merchantCategory || 'other';
      byCategory[cat] = (byCategory[cat] || 0) + 1;

      // Count by status
      const status = offer.status || 'active';
      byStatus[status] = (byStatus[status] || 0) + 1;
    }

    // Find expiring soon (within 7 days)
    const now = new Date();
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const expiringSoon = offers.filter(o => {
      if (!o.expiry || o.expiry === 'Check Portal') return false;
      try {
        const expDate = new Date(o.expiry);
        return expDate >= now && expDate <= sevenDays;
      } catch {
        return false;
      }
    });

    return {
      total: offers.length,
      bySource,
      byCategory,
      byStatus,
      expiringSoon: expiringSoon.length,
      expiringSoonOffers: expiringSoon
    };
  },

  // Download file helper
  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Export as CSV file
  exportCSV(offers, filename = null) {
    const csv = this.toCSV(offers, { dateFormat: 'readable' });
    const date = new Date().toISOString().split('T')[0];
    const fname = filename || `reward-maximizer-offers-${date}.csv`;
    this.downloadFile(csv, fname, 'text/csv');
  },

  // Export as JSON file
  exportJSON(offers, filename = null) {
    const json = this.toJSON(offers);
    const date = new Date().toISOString().split('T')[0];
    const fname = filename || `reward-maximizer-offers-${date}.json`;
    this.downloadFile(json, fname, 'application/json');
  },

  // Export full backup (all data)
  async exportBackup(Storage) {
    const allData = await Storage.exportAllData();
    const json = JSON.stringify(allData, null, 2);
    const date = new Date().toISOString().split('T')[0];
    this.downloadFile(json, `reward-maximizer-backup-${date}.json`, 'application/json');
  },

  // Import from backup file
  async importBackup(file, Storage) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.version) {
            reject(new Error('Invalid backup file format'));
            return;
          }
          await Storage.importData(data);
          resolve(data);
        } catch (err) {
          reject(new Error('Failed to parse backup file: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ExportUtils };
}
