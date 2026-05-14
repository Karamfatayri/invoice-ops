// OCR Service - Integration point for document extraction
// Stub implementation for development; replace with real OCR provider

const VENDOR_PATTERNS = {
  'aws': { name: 'AWS', category: 'cloud' },
  'amazon web services': { name: 'AWS', category: 'cloud' },
  'google cloud': { name: 'Google Cloud', category: 'cloud' },
  'gcp': { name: 'Google Cloud', category: 'cloud' },
  'microsoft azure': { name: 'Azure', category: 'cloud' },
  'azure': { name: 'Azure', category: 'cloud' },
  'datadog': { name: 'Datadog', category: 'monitoring' },
  'snowflake': { name: 'Snowflake', category: 'data' },
  'confluent': { name: 'Confluent', category: 'streaming' },
  'mongodb': { name: 'MongoDB', category: 'database' },
  'hashicorp': { name: 'HashiCorp', category: 'devops' },
  'elastic': { name: 'Elastic', category: 'search' },
  'cloudflare': { name: 'Cloudflare', category: 'cdn' },
};

function extract(filePath, filename) {
  // In production, this would call Tesseract.js, Google Vision, or Azure Form Recognizer
  // For now, return simulated extracted data
  const lowerName = (filename || '').toLowerCase();

  let vendor = { name: 'Unknown Vendor', category: 'other' };
  for (const [pattern, info] of Object.entries(VENDOR_PATTERNS)) {
    if (lowerName.includes(pattern)) {
      vendor = info;
      break;
    }
  }

  const amount = Math.round((Math.random() * 25000 + 500) * 100) / 100;
  const vatRate = 19; // Standard EU VAT
  const vatAmount = Math.round(amount * vatRate / 100 * 100) / 100;

  const today = new Date();
  const invoiceDate = new Date(today);
  invoiceDate.setDate(today.getDate() - Math.floor(Math.random() * 30));

  const dueDate = new Date(invoiceDate);
  dueDate.setDate(invoiceDate.getDate() + 30);

  return {
    vendorName: vendor.name,
    category: vendor.category,
    amount,
    currency: 'EUR',
    vatAmount,
    vatRate,
    date: invoiceDate.toISOString().split('T')[0],
    dueDate: dueDate.toISOString().split('T')[0],
    confidence: Math.round((Math.random() * 15 + 85) * 10) / 10, // 85-100%
    rawData: {
      extractedAt: new Date().toISOString(),
      source: 'stub_ocr',
      filename,
    }
  };
}

module.exports = { extract };
