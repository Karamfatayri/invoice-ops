require('dotenv').config();
const db = require('../src/config/database');
const { Tenant, User, Subscription, Vendor, Invoice, Settings, UsageLog } = require('../src/models');
const { hashPassword } = require('../src/utils/hash');

async function seed() {
  console.log('Seeding database...');

  // Create demo tenant
  const tenant = Tenant.create({ name: 'Acme Corp GmbH', vatNumber: 'DE123456789' });
  console.log('Created tenant:', tenant.name);

  // Create demo user
  const hash = await hashPassword('demo1234');
  const user = User.create({ tenantId: tenant.id, email: 'demo@invoiceops.com', passwordHash: hash, fullName: 'Jane Demo', role: 'owner' });
  console.log('Created user:', user.email, '(password: demo1234)');

  // Create subscription
  Subscription.create({ tenantId: tenant.id });
  console.log('Created trial subscription');

  // Create settings
  Settings.create(tenant.id);

  // Create vendors
  const vendors = [
    { name: 'AWS', category: 'cloud', iconColor: '#ff9900' },
    { name: 'Google Cloud', category: 'cloud', iconColor: '#4285f4' },
    { name: 'Datadog', category: 'monitoring', iconColor: '#632ca6' },
    { name: 'Snowflake', category: 'data', iconColor: '#29b5e8' },
    { name: 'Confluent', category: 'streaming', iconColor: '#1b1464' },
    { name: 'MongoDB', category: 'database', iconColor: '#00ed64' },
    { name: 'HashiCorp', category: 'devops', iconColor: '#000000' },
    { name: 'Elastic', category: 'search', iconColor: '#fed10a' },
    { name: 'Cloudflare', category: 'cdn', iconColor: '#f38020' },
  ];

  const createdVendors = {};
  for (const v of vendors) {
    const vendor = Vendor.create({ tenantId: tenant.id, ...v });
    createdVendors[v.name] = vendor;
    console.log('Created vendor:', v.name);
  }

  // Create sample invoices
  const invoiceData = [
    { vendor: 'AWS', amounts: [24580, 22100, 26300, 21800, 25400, 23700, 24100, 22900] },
    { vendor: 'Google Cloud', amounts: [18200, 16800, 19500, 17300, 18900, 20100] },
    { vendor: 'Datadog', amounts: [8920, 8500, 9200, 8800, 9100, 8700] },
    { vendor: 'Snowflake', amounts: [15340, 14200, 16100, 15800, 14900, 15600] },
    { vendor: 'Confluent', amounts: [3200, 3100, 3400, 3300] },
    { vendor: 'MongoDB', amounts: [6750, 6200, 7100, 6500] },
    { vendor: 'HashiCorp', amounts: [4100, 3900, 4300] },
    { vendor: 'Elastic', amounts: [5600, 5200, 5900] },
    { vendor: 'Cloudflare', amounts: [2800, 2600, 3100] },
  ];

  const statuses = ['processed', 'processed', 'processed', 'processed', 'pending', 'flagged'];
  let totalInvoices = 0;

  for (const group of invoiceData) {
    const vendor = createdVendors[group.vendor];
    for (let i = 0; i < group.amounts.length; i++) {
      const amount = group.amounts[i];
      const daysAgo = i * 30 + Math.floor(Math.random() * 10);
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      const dueDate = new Date(date);
      dueDate.setDate(date.getDate() + 30);

      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const confidence = status === 'flagged' ? 65 + Math.random() * 15 : 88 + Math.random() * 12;

      Invoice.create({
        tenantId: tenant.id,
        vendorId: vendor.id,
        vendorName: group.vendor,
        amount,
        currency: 'EUR',
        vatAmount: Math.round(amount * 0.19 * 100) / 100,
        vatRate: 19,
        date: date.toISOString().split('T')[0],
        dueDate: dueDate.toISOString().split('T')[0],
        status,
        category: vendor.category,
        costCenter: `CC-${vendor.category.toUpperCase()}`,
        confidenceScore: Math.round(confidence * 10) / 10,
        source: 'upload',
        en16931Valid: status === 'processed' ? 1 : 0,
      });
      totalInvoices++;
    }
    // Update vendor spend totals
    Vendor.updateSpend(tenant.id, vendor.id);
  }

  // Update subscription count
  const sub = Subscription.findByTenant(tenant.id);
  db.prepare('UPDATE subscriptions SET invoice_count_this_period = ? WHERE tenant_id = ?').run(totalInvoices, tenant.id);

  console.log(`Created ${totalInvoices} invoices`);
  console.log('\nSeed complete!');
  console.log('Login with: demo@invoiceops.com / demo1234');
}

seed().catch(console.error);
